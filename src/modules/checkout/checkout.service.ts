import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ModifierOptionStatus, OrderAuditAction, OrderStatus, PaymentMethod, PrintStatus, Prisma, ProductAvailabilityStatus, RefundStatus, StoreRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { multiplyMoney, toMoney, toMoneyNumber } from '@/common/utils/money';
import { presentOrder } from '@/common/utils/order-presenter';
import { StoreContextService } from '@/common/store-context.service';
import { PrismaService } from '@/prisma/prisma.service';
import { KitchenService } from '@/modules/kitchen/kitchen.service';
import { ShiftsService } from '@/modules/shifts/shifts.service';

import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrderReasonDto, RefundOrderDto, VoidOrderDto } from './dto/order-action.dto';
import type { AuthRequestUser } from '../auth/auth.types';

type ProductWithModifiers = Prisma.ProductGetPayload<{
  include: {
    modifierGroups: {
      include: {
        options: true;
      };
    };
  };
}>;

type OrderWithLifecycle = Prisma.OrderGetPayload<{
  include: {
    items: { include: { product: true; refundItems: true } };
    payments: true;
    refunds: { include: { items: true } };
    auditLogs: true;
    kitchenTickets: { include: { station: true } };
  };
}>;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
    private readonly shiftsService?: ShiftsService,
    private readonly kitchenService?: KitchenService,
  ) {}

  async listOrders(query: ListOrdersDto) {
    const storeId = this.getStoreId();
    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: { items: { include: { product: true } }, payments: true, kitchenTickets: { include: { station: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.take,
      skip: query.skip,
    });

    return orders.map(presentOrder);
  }

  async getOrder(id: string) {
    const order = await this.findOrder(id);
    return presentOrder(order);
  }

  async createOrder(dto: CreateOrderDto, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const activeShift = await this.resolveCheckoutShift(currentUser);
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId, isActive: true, availabilityStatus: ProductAvailabilityStatus.AVAILABLE },
      include: {
        modifierGroups: {
          where: { status: 'ACTIVE' },
          include: {
            options: {
              where: { status: { not: ModifierOptionStatus.INACTIVE } },
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const missingIds = productIds.filter((id) => !productById.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Product not found, inactive, or sold out: ${missingIds.join(', ')}`);
    }

    const currency = dto.currency ?? products[0]?.currency ?? 'USD';
    const items = dto.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product not found, inactive, or sold out: ${item.productId}`);
      }

      const selectedModifiers = this.resolveSelectedModifiers(product, item.modifiers ?? []);
      const unitPrice = selectedModifiers
        .reduce((price, modifier) => price.plus(modifier.priceDelta), product.price)
        .toDecimalPlaces(2);
      const lineTotal = multiplyMoney(unitPrice, item.quantity);
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        productCategorySnapshot: product.category,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        modifiers: selectedModifiers,
      };
    });

    const subtotal = items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0)).toDecimalPlaces(2);
    const adjustmentResult = this.calculateAdjustment(subtotal, dto.adjustment);
    const adjustedSubtotal = subtotal.minus(adjustmentResult.amount);
    const tax = toMoney(dto.tax ?? 0);
    const tip = toMoney(dto.tip ?? 0);
    const total = adjustedSubtotal.plus(tax).plus(tip).toDecimalPlaces(2);
    const paymentResult = this.resolvePayments(dto.payments, total);

    const order = await this.createPaidOrderWithRetry({
      currency,
      subtotal,
      adjustment: adjustmentResult.amount,
      adjustmentType: dto.adjustment?.type,
      adjustmentValue: dto.adjustment ? toMoney(dto.adjustment.value) : undefined,
      tax,
      tip,
      total,
      paymentResult,
      items,
      storeId,
      shiftId: activeShift?.id,
      createdByUserId: currentUser?.id,
    });

    return presentOrder(order);
  }

  async markPaid(id: string) {
    const order = await this.findOrder(id);
    if (order.status === OrderStatus.PAID) {
      return presentOrder(order);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be marked paid.');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
      },
      include: { items: { include: { product: true } }, payments: true },
    });

    return presentOrder(updated);
  }

  async markPrinted(id: string) {
    const order = await this.findOrder(id);
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Only paid orders can be marked printed.');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        printStatus: PrintStatus.PRINTED,
        printedAt: new Date(),
      },
      include: { items: { include: { product: true } }, payments: true },
    });

    return presentOrder(updated);
  }

  async cancelOrder(id: string, dto: OrderReasonDto, currentUser?: AuthRequestUser) {
    const order = await this.findOrder(id);
    if (order.status === OrderStatus.CANCELLED) {
      return presentOrder(order);
    }
    if (order.status !== OrderStatus.OPEN) {
      throw new BadRequestException('Only open orders can be cancelled.');
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const updatedOrder = await tx.order.update({
          where: { id },
          data: { status: OrderStatus.CANCELLED },
          include: this.orderInclude(),
        });
        await tx.orderAuditLog.create({
          data: {
            storeId: this.getStoreId(),
            orderId: id,
            action: OrderAuditAction.CANCELLED,
            fromStatus: order.status,
            toStatus: OrderStatus.CANCELLED,
            reason: dto.reason,
            operatorId: currentUser?.id,
          },
        });
        await this.kitchenService?.cancelNewTicketsForOrder(tx, {
          storeId: this.getStoreId(),
          orderId: id,
          reason: dto.reason,
        });
        return updatedOrder;
      },
      { maxWait: 30000, timeout: 60000 },
    );

    return presentOrder(updated);
  }

  async voidOrder(id: string, dto: VoidOrderDto, currentUser?: AuthRequestUser) {
    this.assertManagerApproval(currentUser);
    const order = await this.findOrder(id);
    if (order.status === OrderStatus.VOIDED) {
      return presentOrder(order);
    }
    if (order.status !== OrderStatus.OPEN && order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Only open or paid orders can be voided.');
    }
    if (this.getRefundedAmount(order).greaterThan(0)) {
      throw new BadRequestException('Refunded orders cannot be voided.');
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const updatedOrder = await tx.order.update({
          where: { id },
          data: { status: OrderStatus.VOIDED },
          include: this.orderInclude(),
        });
        await tx.orderAuditLog.create({
          data: {
            storeId: this.getStoreId(),
            orderId: id,
            action: OrderAuditAction.VOIDED,
            fromStatus: order.status,
            toStatus: OrderStatus.VOIDED,
            reason: dto.reason,
            operatorId: currentUser?.id,
            approvedById: dto.approvedById ?? currentUser?.id,
          },
        });
        await this.kitchenService?.cancelUnfinishedTicketsForOrder(tx, {
          storeId: this.getStoreId(),
          orderId: id,
          reason: dto.reason,
        });
        return updatedOrder;
      },
      { maxWait: 30000, timeout: 60000 },
    );

    return presentOrder(updated);
  }

  async refundOrder(id: string, dto: RefundOrderDto, currentUser?: AuthRequestUser) {
    this.assertManagerApproval(currentUser);
    const storeId = this.getStoreId();
    const existingRefund = await this.prisma.refund.findUnique({
      where: { storeId_idempotencyKey: { storeId, idempotencyKey: dto.idempotencyKey } },
      include: { items: true },
    });
    if (existingRefund) {
      return this.presentRefund(existingRefund);
    }

    const order = await this.findOrder(id);
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Only paid orders can be refunded.');
    }

    const refundPlan = this.buildRefundPlan(order, dto);
    const updatedStatus = this.resolveRefundedStatus(order, refundPlan.amount);
    const refundNumber = this.createRefundNumber();

    const activeShift =
      (dto.method ?? order.paymentMethod ?? PaymentMethod.MANUAL) === PaymentMethod.CASH && currentUser
        ? await this.shiftsService?.requireActiveShift(currentUser.id)
        : undefined;

    const refund = await this.prisma.$transaction(
      async (tx) => {
        const createdRefund = await tx.refund.create({
          data: {
            storeId,
            orderId: id,
            refundNumber,
            idempotencyKey: dto.idempotencyKey,
            status: RefundStatus.COMPLETED,
            method: (dto.method ?? order.paymentMethod ?? PaymentMethod.MANUAL) as PaymentMethod,
            amount: refundPlan.amount,
            reason: dto.reason,
            operatorId: currentUser?.id,
            approvedById: dto.approvedById ?? currentUser?.id,
            items: refundPlan.items.length > 0 ? { create: refundPlan.items } : undefined,
          },
          include: { items: true },
        });
        await tx.order.update({
          where: { id },
          data: { status: updatedStatus },
        });
        await tx.orderAuditLog.create({
          data: {
            storeId,
            orderId: id,
            action: OrderAuditAction.REFUNDED,
            fromStatus: order.status,
            toStatus: updatedStatus,
            amount: refundPlan.amount,
            reason: dto.reason,
            operatorId: currentUser?.id,
            approvedById: dto.approvedById ?? currentUser?.id,
          },
        });
        if (createdRefund.method === PaymentMethod.CASH && activeShift && this.shiftsService) {
          await this.shiftsService.recordCashRefundMovement(tx, {
            storeId,
            shiftId: activeShift.id,
            refundId: createdRefund.id,
            amount: refundPlan.amount,
            reason: dto.reason,
            createdByUserId: currentUser?.id,
          });
        }
        if (updatedStatus === OrderStatus.REFUNDED) {
          await this.kitchenService?.cancelNewTicketsForOrder(tx, {
            storeId,
            orderId: id,
            reason: dto.reason,
          });
        }
        return createdRefund;
      },
      { maxWait: 30000, timeout: 60000 },
    );

    return this.presentRefund(refund);
  }

  private async findOrder(id: string) {
    const storeId = this.getStoreId();
    const order = await this.prisma.order.findFirst({
      where: { id, storeId },
      include: this.orderInclude(),
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  private createOrderNumber() {
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `POS-${timestamp}-${suffix}`;
  }

  private createRefundNumber() {
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `REF-${timestamp}-${suffix}`;
  }

  private buildRefundPlan(order: OrderWithLifecycle, dto: RefundOrderDto) {
    const remainingOrderAmount = order.total.minus(this.getRefundedAmount(order)).toDecimalPlaces(2);
    if (remainingOrderAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Order has no refundable balance.');
    }

    if (dto.items?.length) {
      const itemPlans = dto.items.map((item) => {
        const orderItem = order.items.find((candidate) => candidate.id === item.orderItemId);
        if (!orderItem) {
          throw new BadRequestException(`Order item not found: ${item.orderItemId}`);
        }
        const alreadyRefundedQuantity = orderItem.refundItems.reduce((sum, refundItem) => sum + refundItem.quantity, 0);
        const refundableQuantity = orderItem.quantity - alreadyRefundedQuantity;
        if (item.quantity > refundableQuantity) {
          throw new BadRequestException(`Refund quantity exceeds refundable quantity for item: ${item.orderItemId}`);
        }
        const amount = orderItem.lineTotal.div(orderItem.quantity).mul(item.quantity).toDecimalPlaces(2);
        return {
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          amount,
        };
      });
      const amount = itemPlans.reduce((sum, item) => sum.plus(item.amount), new Decimal(0)).toDecimalPlaces(2);
      if (amount.greaterThan(remainingOrderAmount)) {
        throw new BadRequestException('Refund amount exceeds refundable balance.');
      }
      return { amount, items: itemPlans };
    }

    const amount = dto.amount === undefined ? remainingOrderAmount : toMoney(dto.amount);
    if (amount.greaterThan(remainingOrderAmount)) {
      throw new BadRequestException('Refund amount exceeds refundable balance.');
    }
    return { amount, items: [] };
  }

  private resolveRefundedStatus(order: OrderWithLifecycle, newRefundAmount: Decimal) {
    const refundedAmount = this.getRefundedAmount(order).plus(newRefundAmount).toDecimalPlaces(2);
    if (refundedAmount.greaterThanOrEqualTo(order.total)) {
      return OrderStatus.REFUNDED;
    }
    return OrderStatus.PARTIALLY_REFUNDED;
  }

  private getRefundedAmount(order: Pick<OrderWithLifecycle, 'refunds'>) {
    return order.refunds.reduce((sum, refund) => sum.plus(refund.amount), new Decimal(0)).toDecimalPlaces(2);
  }

  private assertManagerApproval(currentUser?: AuthRequestUser) {
    if (!currentUser || (currentUser.role !== StoreRole.OWNER && currentUser.role !== StoreRole.MANAGER)) {
      throw new BadRequestException('Manager approval is required.');
    }
  }

  private presentRefund(refund: Prisma.RefundGetPayload<{ include: { items: true } }>) {
    return {
      id: refund.id,
      refundNumber: refund.refundNumber,
      orderId: refund.orderId,
      status: refund.status,
      method: refund.method,
      amount: toMoneyNumber(refund.amount),
      reason: refund.reason,
      operatorId: refund.operatorId,
      approvedById: refund.approvedById,
      createdAt: refund.createdAt.toISOString(),
      items: refund.items.map((item) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        amount: toMoneyNumber(item.amount),
      })),
    };
  }

  private orderInclude() {
    return {
      items: { include: { product: true, refundItems: true } },
      payments: true,
      refunds: { include: { items: true } },
      auditLogs: true,
      kitchenTickets: { include: { station: true } },
    } satisfies Prisma.OrderInclude;
  }

  private async createPickupNumber(tx: Prisma.TransactionClient) {
    const storeId = this.getStoreId();
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const count = await tx.order.count({
      where: {
        storeId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
    return String(count + 1).padStart(4, '0');
  }

  private async createPaidOrderWithRetry(input: {
    storeId: string;
    currency: string;
    subtotal: Decimal;
    adjustment: Decimal;
    adjustmentType?: string;
    adjustmentValue?: Decimal;
    tax: Decimal;
    tip: Decimal;
    total: Decimal;
    paymentResult: ReturnType<CheckoutService['resolvePayments']>;
    shiftId?: string;
    createdByUserId?: string;
    items: Array<{
      productId: string;
      productNameSnapshot: string;
      productCategorySnapshot: string | null;
      quantity: number;
      unitPrice: Decimal;
      lineTotal: Decimal;
      modifiers: Array<{
        groupId: string;
        groupName: string;
        optionId: string;
        optionName: string;
        priceDelta: number;
      }>;
    }>;
  }) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const pickupNumber = await this.createPickupNumber(tx);
            const order = await tx.order.create({
              data: {
                orderNumber: this.createOrderNumber(),
                storeId: input.storeId,
                pickupNumber,
                status: OrderStatus.PAID,
                paymentMethod: input.paymentResult.summaryMethod,
                currency: input.currency,
                subtotal: input.subtotal,
                adjustment: input.adjustment,
                adjustmentType: input.adjustmentType,
                adjustmentValue: input.adjustmentValue,
                tax: input.tax,
                tip: input.tip,
                total: input.total,
                cashReceived: input.paymentResult.cashReceived,
                changeDue: input.paymentResult.changeDue,
                paidAt: new Date(),
                items: { create: input.items },
                payments: { create: input.paymentResult.lines },
              },
              include: { items: { include: { product: true } }, payments: true, kitchenTickets: { include: { station: true } } },
            });
            if (input.shiftId && this.shiftsService) {
              await this.shiftsService.recordCashSaleMovements(tx, {
                storeId: input.storeId,
                shiftId: input.shiftId,
                orderId: order.id,
                payments: order.payments,
                createdByUserId: input.createdByUserId,
              });
            }
            if (this.kitchenService) {
              await this.kitchenService.generateTicketsForOrder(tx, {
                storeId: input.storeId,
                orderId: order.id,
                createdByUserId: input.createdByUserId,
              });
              return tx.order.findUniqueOrThrow({
                where: { id: order.id },
                include: { items: { include: { product: true } }, payments: true, kitchenTickets: { include: { station: true } } },
              });
            }
            return order;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 30000,
            timeout: 60000,
          },
        );
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
        if (attempt === 3 || (code !== 'P2034' && code !== 'P2028')) {
          throw error;
        }
      }
    }

    throw new BadRequestException('Unable to create order.');
  }

  private calculateAdjustment(subtotal: Decimal, adjustment: CreateOrderDto['adjustment']) {
    if (!adjustment) {
      return { amount: new Decimal(0) };
    }

    const value = toMoney(adjustment.value);
    let amount: Decimal;
    switch (adjustment.type) {
      case 'discount':
        if (value.lessThan(0) || value.greaterThan(100)) {
          throw new BadRequestException('Discount must be between 0 and 100.');
        }
        amount = subtotal.mul(new Decimal(100).minus(value)).div(100).toDecimalPlaces(2);
        break;
      case 'fixed_reduction':
        amount = value.toDecimalPlaces(2);
        break;
      case 'price_override':
        amount = subtotal.minus(value).toDecimalPlaces(2);
        break;
      default:
        amount = new Decimal(0);
    }

    if (amount.lessThan(0)) {
      throw new BadRequestException('Adjustment cannot increase the order total.');
    }
    if (amount.greaterThan(subtotal)) {
      throw new BadRequestException('Adjustment cannot exceed subtotal.');
    }

    return { amount: amount.toDecimalPlaces(2) };
  }

  private resolvePayments(payments: CreateOrderDto['payments'], total: Decimal) {
    if (!payments || payments.length === 0) {
      throw new BadRequestException('At least one payment line is required.');
    }

    const lines = payments.map((payment) => {
      const method = payment.method as PaymentMethod;
      const amount = toMoney(payment.amount);
      if (amount.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Payment amount must be greater than zero.');
      }

      if (method !== PaymentMethod.CASH) {
        return {
          method,
          amount,
          amountReceived: undefined,
          changeDue: undefined,
        };
      }

      const amountReceived = toMoney(payment.amountReceived ?? 0);
      if (amountReceived.lessThan(amount)) {
        throw new BadRequestException('Cash received is less than cash payment amount.');
      }

      return {
        method,
        amount,
        amountReceived,
        changeDue: amountReceived.minus(amount).toDecimalPlaces(2),
      };
    });

    const paidAmount = lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toDecimalPlaces(2);
    if (!paidAmount.equals(total)) {
      throw new BadRequestException('Payment lines must equal order total.');
    }

    const cashLines = lines.filter((line) => line.method === PaymentMethod.CASH);
    return {
      lines,
      summaryMethod: lines.length === 1 ? lines[0].method : PaymentMethod.MANUAL,
      cashReceived: cashLines.reduce((sum, line) => sum.plus(line.amountReceived ?? 0), new Decimal(0)).toDecimalPlaces(2),
      changeDue: cashLines.reduce((sum, line) => sum.plus(line.changeDue ?? 0), new Decimal(0)).toDecimalPlaces(2),
    };
  }

  private resolveSelectedModifiers(product: ProductWithModifiers, selections: NonNullable<CreateOrderDto['items'][number]['modifiers']>) {
    const selectedByGroup = new Map(selections.map((selection) => [selection.groupId, selection.optionIds]));
    const snapshots: Array<{
      groupId: string;
      groupName: string;
      optionId: string;
      optionName: string;
      priceDelta: number;
    }> = [];

    for (const group of product.modifierGroups) {
      const optionIds = selectedByGroup.get(group.id) ?? [];
      if (group.required && optionIds.length === 0) {
        throw new BadRequestException(`Modifier group is required: ${group.name}`);
      }
      if (optionIds.length < group.minSelect) {
        throw new BadRequestException(`Modifier group requires at least ${group.minSelect} option(s): ${group.name}`);
      }
      if (optionIds.length > group.maxSelect) {
        throw new BadRequestException(`Modifier group allows at most ${group.maxSelect} option(s): ${group.name}`);
      }
      if (!group.multiSelect && optionIds.length > 1) {
        throw new BadRequestException(`Modifier group allows one option: ${group.name}`);
      }

      const optionsById = new Map(group.options.map((option) => [option.id, option]));
      for (const optionId of optionIds) {
        const option = optionsById.get(optionId);
        if (!option) {
          throw new BadRequestException(`Modifier option does not belong to product: ${optionId}`);
        }
        if (option.status !== ModifierOptionStatus.ACTIVE) {
          throw new BadRequestException(`Modifier option is not available: ${option.name}`);
        }
        snapshots.push({
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: Number(option.priceDelta),
        });
      }
    }

    const knownGroupIds = new Set(product.modifierGroups.map((group) => group.id));
    const unknownGroup = selections.find((selection) => !knownGroupIds.has(selection.groupId));
    if (unknownGroup) {
      throw new BadRequestException(`Modifier group does not belong to product: ${unknownGroup.groupId}`);
    }

    return snapshots;
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }

  private async resolveCheckoutShift(currentUser?: AuthRequestUser) {
    if (!this.shiftsService) {
      return undefined;
    }
    if (!currentUser) {
      throw new BadRequestException('Open shift required before checkout.');
    }
    return this.shiftsService.requireActiveShift(currentUser.id);
  }
}
