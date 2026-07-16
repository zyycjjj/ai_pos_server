import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, DiningTableStatus, ModifierOptionStatus, OrderStatus, OrderType, PaymentMethod, Prisma, ProductAvailabilityStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { StoreContextService } from '@/common/store-context.service';
import { multiplyMoney, toMoney, toMoneyNumber } from '@/common/utils/money';
import { presentOrder } from '@/common/utils/order-presenter';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { PrintService } from '@/modules/print/print.service';
import { ShiftsService } from '@/modules/shifts/shifts.service';
import { PrismaService } from '@/prisma/prisma.service';

import { AddTableItemsDto, CancelTableOrderDto, CheckoutTableDto, OpenTableDto, UpsertDiningAreaDto, UpsertDiningTableDto } from './dto/table.dto';

type ProductWithModifiers = Prisma.ProductGetPayload<{ include: { modifierGroups: { include: { options: true } } } }>;

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftsService: ShiftsService,
    private readonly printService: PrintService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async listAreas() {
    const areas = await this.prisma.diningArea.findMany({ where: { storeId: this.getStoreId() }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return areas.map((area) => ({
      id: area.id,
      name: area.name,
      sortOrder: area.sortOrder,
      status: area.status,
      createdAt: area.createdAt.toISOString(),
      updatedAt: area.updatedAt.toISOString(),
    }));
  }

  async createArea(dto: UpsertDiningAreaDto) {
    const area = await this.prisma.diningArea.create({
      data: { storeId: this.getStoreId(), name: this.clean(dto.name), sortOrder: dto.sortOrder ?? 0, status: dto.status ?? CatalogStatus.ACTIVE },
    });
    return this.listArea(area.id);
  }

  async updateArea(id: string, dto: UpsertDiningAreaDto) {
    await this.findArea(id);
    await this.prisma.diningArea.update({
      where: { id },
      data: { name: this.clean(dto.name), sortOrder: dto.sortOrder ?? 0, status: dto.status ?? CatalogStatus.ACTIVE },
    });
    return this.listArea(id);
  }

  async listTables() {
    const tables = await this.prisma.diningTable.findMany({
      where: { storeId: this.getStoreId() },
      include: { area: true, currentOrder: { include: this.orderInclude() } },
      orderBy: [{ area: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return tables.map((table) => this.presentTable(table));
  }

  async createTable(dto: UpsertDiningTableDto) {
    await this.findArea(dto.areaId);
    const table = await this.prisma.diningTable.create({
      data: {
        storeId: this.getStoreId(),
        areaId: dto.areaId,
        name: this.clean(dto.name),
        seats: dto.seats ?? 2,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? DiningTableStatus.AVAILABLE,
      },
    });
    return this.getTable(table.id);
  }

  async updateTable(id: string, dto: UpsertDiningTableDto) {
    await this.findTable(id);
    await this.findArea(dto.areaId);
    await this.prisma.diningTable.update({
      where: { id },
      data: {
        areaId: dto.areaId,
        name: this.clean(dto.name),
        seats: dto.seats ?? 2,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status,
      },
    });
    return this.getTable(id);
  }

  async getTable(id: string) {
    const table = await this.prisma.diningTable.findFirst({
      where: { id, storeId: this.getStoreId() },
      include: { area: true, currentOrder: { include: this.orderInclude() } },
    });
    if (!table) throw new NotFoundException('Table not found.');
    return this.presentTable(table);
  }

  async openTable(id: string, dto: OpenTableDto, currentUser?: AuthRequestUser) {
    const table = await this.findTable(id);
    if (table.status !== DiningTableStatus.AVAILABLE && table.status !== DiningTableStatus.RESERVED) {
      throw new BadRequestException('Only available or reserved tables can be opened.');
    }
    await this.prisma.$transaction(async (tx) => {
      const pickupNumber = await this.createPickupNumber(tx);
      const created = await tx.order.create({
        data: {
          storeId: this.getStoreId(),
          orderNumber: this.createOrderNumber(),
          pickupNumber,
          orderType: OrderType.DINE_IN,
          tableId: table.id,
          guestCount: dto.guestCount,
          status: OrderStatus.OPEN,
          currency: 'USD',
          subtotal: 0,
          total: 0,
          openedAt: new Date(),
        },
        include: this.orderInclude(),
      });
      await tx.diningTable.update({ where: { id }, data: { status: DiningTableStatus.OCCUPIED, currentOrderId: created.id } });
      return created;
    });
    return this.getTable(id);
  }

  async addItems(id: string, dto: AddTableItemsDto) {
    const table = await this.findTableWithOrder(id);
    const order = table.currentOrder;
    if (!order || order.status !== OrderStatus.OPEN) throw new BadRequestException('Table has no open order.');
    const draftItems = await this.resolveItems(dto.items);
    const existingSubtotal = order.items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0));
    const subtotal = existingSubtotal.plus(draftItems.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0))).toDecimalPlaces(2);
    await this.prisma.order.update({
      where: { id: order.id },
      data: { subtotal, total: subtotal, items: { create: draftItems } },
      include: this.orderInclude(),
    });
    return this.getTable(id);
  }

  async checkout(id: string, dto: CheckoutTableDto, currentUser?: AuthRequestUser) {
    const table = await this.findTableWithOrder(id);
    const order = table.currentOrder;
    if (!order || order.status !== OrderStatus.OPEN) throw new BadRequestException('Table has no open order.');
    const activeShift = currentUser ? await this.shiftsService.requireActiveShift(currentUser.id) : undefined;
    const tip = toMoney(dto.tip ?? 0);
    const total = order.subtotal.plus(tip).toDecimalPlaces(2);
    const paymentResult = this.resolvePayments(dto.payments, total);
    const paid = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          tip,
          total,
          paymentMethod: paymentResult.summaryMethod,
          cashReceived: paymentResult.cashReceived,
          changeDue: paymentResult.changeDue,
          paidAt: new Date(),
          closedAt: new Date(),
          payments: { create: paymentResult.lines },
        },
        include: this.orderInclude(),
      });
      if (activeShift) {
        await this.shiftsService.recordCashSaleMovements(tx, {
          storeId: this.getStoreId(),
          shiftId: activeShift.id,
          orderId: updated.id,
          payments: updated.payments,
          createdByUserId: currentUser?.id,
        });
      }
      await tx.diningTable.update({ where: { id }, data: { status: DiningTableStatus.DIRTY, currentOrderId: null } });
      return updated;
    });
    await this.printService.createAutoJobsForOrder(paid.id).catch(() => undefined);
    return this.getTable(id);
  }

  async clearTable(id: string) {
    const table = await this.findTable(id);
    if (table.status !== DiningTableStatus.DIRTY) throw new BadRequestException('Only dirty tables can be cleared.');
    const updated = await this.prisma.diningTable.update({ where: { id }, data: { status: DiningTableStatus.AVAILABLE, currentOrderId: null } });
    return this.getTable(updated.id);
  }

  async cancelOpenOrder(id: string, dto: CancelTableOrderDto) {
    const table = await this.findTableWithOrder(id);
    const order = table.currentOrder;
    if (!order || order.status !== OrderStatus.OPEN) throw new BadRequestException('Table has no open order.');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED, closedAt: new Date() } });
      return tx.diningTable.update({ where: { id }, data: { status: DiningTableStatus.DIRTY, currentOrderId: null } });
    });
    return this.getTable(updated.id);
  }

  private async listArea(id: string) {
    const area = await this.findArea(id);
    return { id: area.id, name: area.name, sortOrder: area.sortOrder, status: area.status, createdAt: area.createdAt.toISOString(), updatedAt: area.updatedAt.toISOString() };
  }

  private async findArea(id: string) {
    const area = await this.prisma.diningArea.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!area) throw new NotFoundException('Dining area not found.');
    return area;
  }

  private async findTable(id: string) {
    const table = await this.prisma.diningTable.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!table) throw new NotFoundException('Table not found.');
    return table;
  }

  private async findTableWithOrder(id: string) {
    const table = await this.prisma.diningTable.findFirst({
      where: { id, storeId: this.getStoreId() },
      include: { currentOrder: { include: this.orderInclude() } },
    });
    if (!table) throw new NotFoundException('Table not found.');
    return table;
  }

  private async resolveItems(items: AddTableItemsDto['items']) {
    const storeId = this.getStoreId();
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId, isActive: true, availabilityStatus: ProductAvailabilityStatus.AVAILABLE },
      include: { modifierGroups: { where: { status: 'ACTIVE' }, include: { options: { where: { status: { not: ModifierOptionStatus.INACTIVE } } } } } },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    return items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) throw new BadRequestException(`Product not found, inactive, or sold out: ${item.productId}`);
      const modifiers = this.resolveSelectedModifiers(product, item.modifiers ?? []);
      const unitPrice = modifiers.reduce((price, modifier) => price.plus(modifier.priceDelta), product.price).toDecimalPlaces(2);
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        productCategorySnapshot: product.category,
        quantity: item.quantity,
        unitPrice,
        lineTotal: multiplyMoney(unitPrice, item.quantity),
        modifiers,
      };
    });
  }

  private resolveSelectedModifiers(product: ProductWithModifiers, selections: NonNullable<AddTableItemsDto['items'][number]['modifiers']>) {
    const selectedByGroup = new Map(selections.map((selection) => [selection.groupId, selection.optionIds]));
    const snapshots: Array<{ groupId: string; groupName: string; optionId: string; optionName: string; priceDelta: number }> = [];
    for (const group of product.modifierGroups) {
      const optionIds = selectedByGroup.get(group.id) ?? [];
      if (group.required && optionIds.length === 0) throw new BadRequestException(`Modifier group is required: ${group.name}`);
      const optionsById = new Map(group.options.map((option) => [option.id, option]));
      for (const optionId of optionIds) {
        const option = optionsById.get(optionId);
        if (!option || option.status !== ModifierOptionStatus.ACTIVE) throw new BadRequestException(`Modifier option is not available: ${optionId}`);
        snapshots.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, priceDelta: Number(option.priceDelta) });
      }
    }
    return snapshots;
  }

  private resolvePayments(payments: CheckoutTableDto['payments'], total: Decimal) {
    const lines = payments.map((payment) => {
      const method = payment.method as PaymentMethod;
      const amount = toMoney(payment.amount);
      if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('Payment amount must be greater than zero.');
      if (method !== PaymentMethod.CASH) return { method, amount, amountReceived: undefined, changeDue: undefined };
      const amountReceived = toMoney(payment.amountReceived ?? 0);
      if (amountReceived.lessThan(amount)) throw new BadRequestException('Cash received is less than cash payment amount.');
      return { method, amount, amountReceived, changeDue: amountReceived.minus(amount).toDecimalPlaces(2) };
    });
    const paidAmount = lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toDecimalPlaces(2);
    if (!paidAmount.equals(total)) throw new BadRequestException('Payment lines must equal order total.');
    const cashLines = lines.filter((line) => line.method === PaymentMethod.CASH);
    return {
      lines,
      summaryMethod: lines.length === 1 ? lines[0].method : PaymentMethod.MANUAL,
      cashReceived: cashLines.reduce((sum, line) => sum.plus(line.amountReceived ?? 0), new Decimal(0)).toDecimalPlaces(2),
      changeDue: cashLines.reduce((sum, line) => sum.plus(line.changeDue ?? 0), new Decimal(0)).toDecimalPlaces(2),
    };
  }

  private presentTable(table: Prisma.DiningTableGetPayload<{ include: { area: true; currentOrder: { include: ReturnType<TablesService['orderInclude']> } } }>) {
    return {
      id: table.id,
      areaId: table.areaId,
      areaName: table.area.name,
      name: table.name,
      seats: table.seats,
      status: table.status,
      sortOrder: table.sortOrder,
      currentOrderId: table.currentOrderId,
      currentOrder: table.currentOrder ? presentOrder(table.currentOrder) : null,
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    };
  }

  private orderInclude() {
    return { table: true, items: { include: { product: true, refundItems: true } }, payments: true, refunds: { include: { items: true } }, auditLogs: true, kitchenTickets: { include: { station: true } } } satisfies Prisma.OrderInclude;
  }

  private async createPickupNumber(tx: Prisma.TransactionClient) {
    const count = await tx.order.count({ where: { storeId: this.getStoreId(), createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
    return String(count + 1).padStart(4, '0');
  }

  private createOrderNumber() {
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `POS-${timestamp}-${suffix}`;
  }

  private clean(value: string) {
    const cleaned = value.trim();
    if (!cleaned) throw new BadRequestException('Name is required.');
    return cleaned;
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
