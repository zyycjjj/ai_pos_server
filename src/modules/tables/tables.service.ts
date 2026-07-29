import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, DiningTableStatus, KitchenTicketStatus, ModifierOptionStatus, OrderAuditAction, OrderStatus, OrderType, PaymentMethod, Prisma, ProductAvailabilityStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { StoreContextService } from '@/common/store-context.service';
import { multiplyMoney, toMoney, toMoneyNumber } from '@/common/utils/money';
import { presentOrder } from '@/common/utils/order-presenter';
import { CustomersService } from '@/modules/customers/customers.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { PrintService } from '@/modules/print/print.service';
import { ShiftsService } from '@/modules/shifts/shifts.service';
import { KitchenService } from '@/modules/kitchen/kitchen.service';
import { PrismaService } from '@/prisma/prisma.service';

import { AddTableItemsDto, BatchCreateDiningTablesDto, CancelTableOrderDto, CheckoutTableDto, DeleteTableOrderItemDto, MergeTableDto, OpenTableDto, SplitBillDto, TransferTableDto, UpdateTableOrderItemDto, UpsertDiningAreaDto, UpsertDiningTableDto } from './dto/table.dto';

type ProductWithModifiers = Prisma.ProductGetPayload<{ include: { modifierGroups: { include: { options: true } } } }>;

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftsService: ShiftsService,
    private readonly printService: PrintService,
    private readonly kitchenService: KitchenService,
    private readonly customersService: CustomersService,
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

  async batchCreateTables(dto: BatchCreateDiningTablesDto) {
    const storeId = this.getStoreId();
    const area = dto.areaId ? await this.findArea(dto.areaId) : await this.findOrCreateAreaByName(dto.areaName);
    const prefix = this.clean(dto.prefix);
    const count = dto.count;
    if (count > 200) throw new BadRequestException('Batch table count cannot exceed 200.');
    const digits = dto.digits ?? 2;
    const seats = dto.defaultSeats ?? 2;
    const skipExisting = dto.skipExisting ?? true;
    const requested = Array.from({ length: count }, (_, index) => {
      const number = dto.startNumber + index;
      return { name: `${prefix}${String(number).padStart(digits, '0')}`, sortOrder: number };
    });
    const existing = await this.prisma.diningTable.findMany({
      where: { storeId, areaId: area.id, name: { in: requested.map((item) => item.name) } },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((item) => item.name));
    if (existingNames.size > 0 && !skipExisting) throw new BadRequestException('Some tables already exist in this area.');
    const toCreate = requested.filter((item) => !existingNames.has(item.name));
    const created = await this.prisma.$transaction(
      toCreate.map((item) =>
        this.prisma.diningTable.create({
          data: { storeId, areaId: area.id, name: item.name, seats, sortOrder: item.sortOrder, status: DiningTableStatus.AVAILABLE },
        }),
      ),
    );
    return {
      areaId: area.id,
      areaName: area.name,
      created: created.length,
      skipped: requested.length - created.length,
      items: requested.map((item) => ({ name: item.name, status: existingNames.has(item.name) ? 'SKIPPED' : 'CREATED' })),
    };
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
    const tickets = await this.prisma.$transaction(async (tx) => {
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
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: created.id,
          action: OrderAuditAction.TABLE_OPENED,
          fromStatus: null,
          toStatus: OrderStatus.OPEN,
          reason: `Table opened: ${table.name}`,
          operatorId: currentUser?.id,
        },
      });
      return created;
    });
    return this.getTable(id);
  }

  async addItems(id: string, dto: AddTableItemsDto, currentUser?: AuthRequestUser) {
    const table = await this.findTableWithOrder(id);
    const order = table.currentOrder;
    if (!order || order.status !== OrderStatus.OPEN) throw this.businessError('TABLE_ORDER_NOT_OPEN', 'Table has no open order.');
    const draftItems = await this.resolveItems(dto.items);
    const existingSubtotal = order.items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0));
    const subtotal = existingSubtotal.plus(draftItems.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0))).toDecimalPlaces(2);
    const tickets = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { subtotal, total: subtotal.plus(order.tip).toDecimalPlaces(2) },
      });
      const createdItems = [];
      for (const draftItem of draftItems) {
        createdItems.push(await tx.orderItem.create({ data: { orderId: order.id, ...draftItem } }));
      }
      return this.kitchenService.generateTicketsForOrder(tx, {
        storeId: this.getStoreId(),
        orderId: order.id,
        createdByUserId: currentUser?.id,
        orderItemIds: createdItems.map((item) => item.id),
      });
    });
    for (const ticket of tickets) {
      await this.printService.createAutoKitchenTicketJob(ticket.id).catch(() => undefined);
    }
    return this.getTable(id);
  }

  async updateOrderItem(id: string, itemId: string, dto: UpdateTableOrderItemDto) {
    const table = await this.findTableWithOrder(id);
    const order = table.currentOrder;
    if (!order || order.status !== OrderStatus.OPEN) throw new BadRequestException('Table has no open order.');
    const item = order.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException('Order item not found.');
    await this.assertOrderItemEditable(itemId);
    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity, lineTotal: multiplyMoney(item.unitPrice, dto.quantity) },
      });
      await this.repriceOrder(tx, order.id);
      await tx.kitchenTicketItem.updateMany({
        where: { orderItemId: itemId, status: KitchenTicketStatus.NEW },
        data: { quantity: dto.quantity },
      });
    });
    return this.getTable(id);
  }

  async deleteOrderItem(id: string, itemId: string, dto: DeleteTableOrderItemDto = {}, currentUser?: AuthRequestUser) {
    const table = await this.findTableWithOrder(id);
    const order = table.currentOrder;
    if (!order || order.status !== OrderStatus.OPEN) throw this.businessError('TABLE_ORDER_NOT_OPEN', 'Table has no open order.');
    if (!order.items.some((item) => item.id === itemId)) throw new NotFoundException('Order item not found.');
    await this.assertOrderItemEditable(itemId);
    await this.prisma.$transaction(async (tx) => {
      const ticketItems = await tx.kitchenTicketItem.findMany({ where: { orderItemId: itemId }, select: { ticketId: true } });
      await tx.kitchenTicketItem.deleteMany({ where: { orderItemId: itemId } });
      await tx.orderItem.delete({ where: { id: itemId } });
      await this.repriceOrder(tx, order.id);
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: order.id,
          action: OrderAuditAction.TABLE_ITEM_REMOVED,
          fromStatus: OrderStatus.OPEN,
          toStatus: OrderStatus.OPEN,
          reason: dto.reason ?? 'Pending table item removed.',
          operatorId: currentUser?.id,
        },
      });
      const ticketIds = [...new Set(ticketItems.map((item) => item.ticketId))];
      for (const ticketId of ticketIds) {
        const remaining = await tx.kitchenTicketItem.count({ where: { ticketId } });
        if (remaining === 0) {
          await tx.kitchenTicket.update({
            where: { id: ticketId },
            data: { status: KitchenTicketStatus.CANCELLED, cancelledAt: new Date(), cancelReason: 'All pending items removed before preparation.' },
          });
        }
      }
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
      const customer = await this.customersService.resolveOrderCustomer(tx, this.getStoreId(), {
        customerId: dto.customerId,
        customerPhone: dto.customerPhone,
        customerName: dto.customerName,
      });
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          customerId: customer?.customerId,
          customerPhoneSnapshot: customer?.customerPhoneSnapshot,
          customerNameSnapshot: customer?.customerNameSnapshot,
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
      await this.customersService.recordPaidOrder(tx, {
        storeId: this.getStoreId(),
        customerId: customer?.customerId,
        orderId: updated.id,
        orderTotal: updated.total,
        paidAt: updated.paidAt ?? new Date(),
        createdByUserId: currentUser?.id,
      });
      await tx.diningTable.update({ where: { id }, data: { status: DiningTableStatus.DIRTY, currentOrderId: null } });
      return tx.order.findUniqueOrThrow({ where: { id: updated.id }, include: this.orderInclude() });
    });
    await this.printService.createAutoJobsForOrder(paid.id).catch(() => undefined);
    return this.getTable(id);
  }

  async transferTable(id: string, dto: TransferTableDto, currentUser?: AuthRequestUser) {
    if (id === dto.targetTableId) throw new BadRequestException('Target table must be different.');
    const [source, target] = await Promise.all([this.findTableWithOrder(id), this.findTable(dto.targetTableId)]);
    const order = source.currentOrder;
    if (source.status !== DiningTableStatus.OCCUPIED || !order || order.status !== OrderStatus.OPEN) {
      throw new BadRequestException('Only occupied tables with an open order can be transferred.');
    }
    if (target.status !== DiningTableStatus.AVAILABLE && target.status !== DiningTableStatus.RESERVED) {
      throw new BadRequestException('Target table must be available or reserved.');
    }
    // Transfer moves the single open order pointer atomically so source and target tables cannot both claim the same dine-in order.
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { tableId: target.id } });
      await tx.diningTable.update({ where: { id: source.id }, data: { status: DiningTableStatus.AVAILABLE, currentOrderId: null } });
      await tx.diningTable.update({ where: { id: target.id }, data: { status: DiningTableStatus.OCCUPIED, currentOrderId: order.id } });
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: order.id,
          action: OrderAuditAction.TABLE_TRANSFERRED,
          fromStatus: OrderStatus.OPEN,
          toStatus: OrderStatus.OPEN,
          reason: dto.reason ?? `Table transferred from ${source.name} to ${target.name}`,
          operatorId: currentUser?.id,
        },
      });
    });
    return this.getTable(target.id);
  }

  async mergeTable(id: string, dto: MergeTableDto, currentUser?: AuthRequestUser) {
    if (id === dto.targetTableId) throw new BadRequestException('Target table must be different.');
    const [source, target] = await Promise.all([this.findTableWithOrder(id), this.findTableWithOrder(dto.targetTableId)]);
    const sourceOrder = source.currentOrder;
    const targetOrder = target.currentOrder;
    if (source.status !== DiningTableStatus.OCCUPIED || !sourceOrder || sourceOrder.status !== OrderStatus.OPEN) throw new BadRequestException('Source table must have an open order.');
    if (target.status !== DiningTableStatus.OCCUPIED || !targetOrder || targetOrder.status !== OrderStatus.OPEN) throw new BadRequestException('Target table must have an open order.');
    const sourceItems = sourceOrder.items.map((item) => this.cloneOrderItemData(item));
    const newSubtotal = this.sumItems([...targetOrder.items, ...sourceOrder.items]).toDecimalPlaces(2);
    // Merge keeps the target order as the surviving bill and cancels the source order with audit records instead of deleting history.
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: targetOrder.id },
        data: {
          guestCount: (targetOrder.guestCount ?? 0) + (sourceOrder.guestCount ?? 0),
          subtotal: newSubtotal,
          total: newSubtotal.plus(targetOrder.tip).toDecimalPlaces(2),
          items: { create: sourceItems },
        },
      });
      await tx.order.update({ where: { id: sourceOrder.id }, data: { status: OrderStatus.CANCELLED, closedAt: new Date(), tableId: null } });
      await tx.diningTable.update({ where: { id: source.id }, data: { status: DiningTableStatus.AVAILABLE, currentOrderId: null } });
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: targetOrder.id,
          action: OrderAuditAction.TABLE_MERGED,
          fromStatus: OrderStatus.OPEN,
          toStatus: OrderStatus.OPEN,
          reason: dto.reason ?? `Merged ${source.name} into ${target.name}; source order ${sourceOrder.orderNumber}`,
          operatorId: currentUser?.id,
        },
      });
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: sourceOrder.id,
          action: OrderAuditAction.TABLE_MERGED,
          fromStatus: OrderStatus.OPEN,
          toStatus: OrderStatus.CANCELLED,
          reason: dto.reason ?? `Merged into ${target.name}; target order ${targetOrder.orderNumber}`,
          operatorId: currentUser?.id,
        },
      });
    });
    return this.getTable(target.id);
  }

  async splitBill(id: string, dto: SplitBillDto, currentUser?: AuthRequestUser) {
    const table = await this.findTableWithOrder(id);
    const order = table.currentOrder;
    if (!order || order.status !== OrderStatus.OPEN) throw new BadRequestException('Only open table orders can be split.');
    const selected = this.resolveSplitSelection(order.items, dto.items);
    const remainingItems = order.items.flatMap((item) => {
      const quantity = item.quantity - (selected.get(item.id)?.quantity ?? 0);
      return quantity > 0 ? [{ item, quantity }] : [];
    });
    if (remainingItems.length === 0) throw new BadRequestException('Split cannot move every item from the table order.');
    const splitItems = Array.from(selected.values()).map(({ item, quantity }) => this.cloneOrderItemData(item, quantity));
    const remainingSubtotal = remainingItems.reduce((sum, { item, quantity }) => sum.plus(multiplyMoney(item.unitPrice, quantity)), new Decimal(0)).toDecimalPlaces(2);
    const splitSubtotal = Array.from(selected.values()).reduce((sum, { item, quantity }) => sum.plus(multiplyMoney(item.unitPrice, quantity)), new Decimal(0)).toDecimalPlaces(2);
    // Split bill creates a separate open order while leaving at least one item on the table order, preserving post-pay checkout state.
    const splitOrder = await this.prisma.$transaction(async (tx) => {
      for (const { item, quantity } of remainingItems) {
        await tx.orderItem.update({ where: { id: item.id }, data: { quantity, lineTotal: multiplyMoney(item.unitPrice, quantity) } });
      }
      for (const { item, quantity } of selected.values()) {
        if (quantity === item.quantity) {
          await tx.orderItem.delete({ where: { id: item.id } });
        } else {
          await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.quantity - quantity, lineTotal: multiplyMoney(item.unitPrice, item.quantity - quantity) } });
        }
      }
      await tx.order.update({ where: { id: order.id }, data: { subtotal: remainingSubtotal, total: remainingSubtotal.plus(order.tip).toDecimalPlaces(2) } });
      const created = await tx.order.create({
        data: {
          storeId: this.getStoreId(),
          orderNumber: this.createOrderNumber(),
          pickupNumber: await this.createPickupNumber(tx),
          orderType: OrderType.DINE_IN,
          tableId: table.id,
          guestCount: 0,
          status: OrderStatus.OPEN,
          currency: order.currency,
          subtotal: splitSubtotal,
          total: splitSubtotal,
          openedAt: new Date(),
          items: { create: splitItems },
        },
        include: this.orderInclude(),
      });
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: order.id,
          action: OrderAuditAction.BILL_SPLIT,
          fromStatus: OrderStatus.OPEN,
          toStatus: OrderStatus.OPEN,
          reason: dto.reason ?? `Split bill created ${created.orderNumber}`,
          operatorId: currentUser?.id,
        },
      });
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: created.id,
          action: OrderAuditAction.BILL_SPLIT,
          fromStatus: null,
          toStatus: OrderStatus.OPEN,
          reason: dto.reason ?? `Split from ${order.orderNumber}`,
          operatorId: currentUser?.id,
        },
      });
      return created;
    });
    return presentOrder(splitOrder);
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
    if (!order || order.status !== OrderStatus.OPEN) throw this.businessError('TABLE_ORDER_NOT_OPEN', 'Table has no open order.');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED, closedAt: new Date() } });
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: order.id,
          action: OrderAuditAction.CANCELLED,
          fromStatus: OrderStatus.OPEN,
          toStatus: OrderStatus.CANCELLED,
          reason: dto.reason ?? 'Table order cancelled.',
        },
      });
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

  private async findOrCreateAreaByName(areaName?: string) {
    const name = this.clean(areaName ?? '');
    const existing = await this.prisma.diningArea.findFirst({ where: { storeId: this.getStoreId(), name } });
    if (existing) return existing;
    return this.prisma.diningArea.create({
      data: { storeId: this.getStoreId(), name, sortOrder: 0, status: CatalogStatus.ACTIVE },
    });
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

  private async assertOrderItemEditable(itemId: string) {
    const started = await this.prisma.kitchenTicketItem.findFirst({
      where: { orderItemId: itemId, status: { in: [KitchenTicketStatus.PREPARING, KitchenTicketStatus.READY, KitchenTicketStatus.COMPLETED] } },
    });
    if (started) {
      throw new BadRequestException('Prepared or in-progress items cannot be edited directly.');
    }
  }

  private async repriceOrder(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const subtotal = order.items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0)).toDecimalPlaces(2);
    await tx.order.update({
      where: { id: orderId },
      data: { subtotal, total: subtotal.plus(order.tip).toDecimalPlaces(2) },
    });
  }

  private async resolveItems(items: AddTableItemsDto['items']) {
    const storeId = this.getStoreId();
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId },
      include: { modifierGroups: { where: { status: 'ACTIVE' }, include: { options: true } } },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    return items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) throw new BadRequestException(`Product not found: ${item.productId}`);
      this.assertProductOrderable(product);
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
        note: item.note?.trim() || undefined,
      };
    });
  }

  private resolveSelectedModifiers(product: ProductWithModifiers, selections: NonNullable<AddTableItemsDto['items'][number]['modifiers']>) {
    const selectedByGroup = new Map<string, string[]>();
    for (const selection of selections) {
      selectedByGroup.set(selection.groupId, [...(selectedByGroup.get(selection.groupId) ?? []), ...selection.optionIds]);
    }
    const activeGroupIds = new Set(product.modifierGroups.map((group) => group.id));
    for (const groupId of selectedByGroup.keys()) {
      if (!activeGroupIds.has(groupId)) throw this.businessError('INVALID_MODIFIER_SELECTION', `Modifier group does not belong to product: ${groupId}`);
    }
    const snapshots: Array<{ groupId: string; groupName: string; optionId: string; optionName: string; priceDelta: number }> = [];
    for (const group of product.modifierGroups) {
      const optionIds = [...new Set(selectedByGroup.get(group.id) ?? [])];
      const minSelect = group.minSelect ?? (group.required ? 1 : 0);
      const maxSelect = group.maxSelect ?? (group.multiSelect ? Number.MAX_SAFE_INTEGER : 1);
      if (optionIds.length < minSelect) throw this.businessError('REQUIRED_MODIFIER_MISSING', `Modifier group is required: ${group.name}`);
      if (optionIds.length > maxSelect || (!group.multiSelect && optionIds.length > 1)) {
        throw this.businessError('INVALID_MODIFIER_SELECTION', `Invalid modifier selection for group: ${group.name}`);
      }
      const optionsById = new Map(group.options.map((option) => [option.id, option]));
      for (const optionId of optionIds) {
        const option = optionsById.get(optionId);
        if (!option) throw this.businessError('INVALID_MODIFIER_SELECTION', `Modifier option does not belong to product: ${optionId}`);
        if (option.status === ModifierOptionStatus.INACTIVE) throw this.businessError('MODIFIER_OPTION_INACTIVE', `Modifier option is not available: ${option.name}`);
        if (option.status === ModifierOptionStatus.SOLD_OUT) throw this.businessError('MODIFIER_OPTION_SOLD_OUT', `Modifier option is not available: ${option.name}`);
        snapshots.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, priceDelta: Number(option.priceDelta) });
      }
    }
    return snapshots;
  }

  private assertProductOrderable(product: Pick<ProductWithModifiers, 'name' | 'isActive' | 'availabilityStatus'>) {
    if (product.isActive === false) {
      throw this.businessError('PRODUCT_INACTIVE', `Product is inactive: ${product.name}`);
    }
    if (product.availabilityStatus === ProductAvailabilityStatus.SOLD_OUT) {
      throw this.businessError('PRODUCT_SOLD_OUT', `Product is sold out: ${product.name}`);
    }
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

  private cloneOrderItemData(item: Prisma.OrderItemGetPayload<{ include: { product: true; refundItems: true } }>, quantity = item.quantity) {
    return {
      productId: item.productId,
      productNameSnapshot: item.productNameSnapshot,
      productCategorySnapshot: item.productCategorySnapshot,
      quantity,
      unitPrice: item.unitPrice,
      lineTotal: multiplyMoney(item.unitPrice, quantity),
      modifiers: item.modifiers as Prisma.InputJsonValue,
      note: item.note,
    };
  }

  private sumItems(items: Array<{ lineTotal: Decimal }>) {
    return items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0));
  }

  private resolveSplitSelection(items: Prisma.OrderItemGetPayload<{ include: { product: true; refundItems: true } }>[], selections: SplitBillDto['items']) {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const selected = new Map<string, { item: Prisma.OrderItemGetPayload<{ include: { product: true; refundItems: true } }>; quantity: number }>();
    for (const selection of selections) {
      const item = itemById.get(selection.orderItemId);
      if (!item) throw new BadRequestException(`Order item not found: ${selection.orderItemId}`);
      const already = selected.get(item.id)?.quantity ?? 0;
      const nextQuantity = already + selection.quantity;
      if (nextQuantity > item.quantity) throw new BadRequestException('Split quantity exceeds available quantity.');
      selected.set(item.id, { item, quantity: nextQuantity });
    }
    return selected;
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
    return { table: true, items: { include: { product: true, refundItems: true, kitchenTicketItems: true } }, payments: true, refunds: { include: { items: true } }, auditLogs: true, kitchenTickets: { include: { station: true } } } satisfies Prisma.OrderInclude;
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

  private businessError(code: string, message: string) {
    return new BadRequestException({ code, message });
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
