import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, ModifierOptionStatus, OrderAuditAction, OrderStatus, OrderType, PaymentMethod, PrintStatus, Prisma, ProductAvailabilityStatus, RefundStatus, StoreRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { multiplyMoney, toMoneyNumber } from '@/common/utils/money';
import { presentOrder } from '@/common/utils/order-presenter';
import { StoreContextService } from '@/common/store-context.service';
import { PrismaService } from '@/prisma/prisma.service';
import { CustomersService, type ResolvedOrderCustomer } from '@/modules/customers/customers.service';
import { KitchenService } from '@/modules/kitchen/kitchen.service';
import { PrintService } from '@/modules/print/print.service';
import { ShiftsService } from '@/modules/shifts/shifts.service';

import { CheckoutPreviewDto, CreateOrderDto, HoldOrderDto, PayOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrderReasonDto, RefundOrderDto, VoidOrderDto } from './dto/order-action.dto';
import { buildCheckoutPricing, calculateManualAdjustment } from './pricing/checkout-pricing';
import { validatePaymentLines, type PaymentValidationResult } from './payments/payment-lines.validator';
import { buildRefundPlan, getRefundedAmount, resolveRefundedStatus } from './refund/refund-amount-calculator';
import { evaluateCheckoutPromotions } from './promotion/checkout-promotion.adapter';
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
    private readonly printService?: PrintService,
    private readonly customersService?: CustomersService,
  ) {}

  async listOrders(query: ListOrdersDto) {
    const storeId = this.getStoreId();
    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: this.orderListInclude(),
      orderBy: { createdAt: 'desc' },
      take: query.take,
      skip: query.skip,
    });

    return orders.map(presentOrder);
  }

  async getOrder(id: string) {
    const order = await this.findOrder(id);
    await this.printService?.createAutoJobsForOrder(order.id).catch(() => undefined);
    return presentOrder(order);
  }

  async createOrder(dto: CreateOrderDto, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const activeShift = await this.resolveCheckoutShift(currentUser);
    const customerInput = this.pickCustomerInput(dto);
    const customer = await this.resolveCustomerBeforePricing(storeId, customerInput);
    const orderDraft = await this.buildOrderDraft(dto, currentUser, customer?.customerId);
    const total = orderDraft.total;
    const paymentResult = validatePaymentLines(dto.payments, total);

    const order = await this.createPaidOrderWithRetry({
      ...orderDraft,
      paymentResult,
      storeId,
      shiftId: activeShift?.id,
      createdByUserId: currentUser?.id,
      customerInput,
      customer,
    });

    await this.printService?.createAutoJobsForOrder(order.id).catch(() => undefined);

    return presentOrder(order);
  }

  async preview(dto: CheckoutPreviewDto, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const customerLookup = await this.lookupCustomerForPreview(storeId, this.pickCustomerInput(dto));
    const orderDraft = await this.buildOrderDraft(dto, currentUser, customerLookup.customer?.id, { includePreviewDetails: true });

    return {
      currency: orderDraft.currency,
      orderType: orderDraft.orderType,
      subtotal: toMoneyNumber(orderDraft.subtotal),
      promotionDiscountAmount: toMoneyNumber(orderDraft.promotionDiscountAmount),
      manualDiscountAmount: toMoneyNumber(orderDraft.manualDiscountAmount),
      totalDiscountAmount: toMoneyNumber(orderDraft.totalDiscountAmount),
      taxAmount: toMoneyNumber(orderDraft.tax),
      serviceChargeAmount: toMoneyNumber(orderDraft.serviceCharge),
      tipAmount: toMoneyNumber(orderDraft.tip),
      total: toMoneyNumber(orderDraft.total),
      customer: customerLookup.customer,
      customerLookup: customerLookup.lookup,
      appliedPromotions: orderDraft.appliedPromotions,
      eligiblePromotions: orderDraft.eligiblePromotions ?? [],
      rejectedPromotions: orderDraft.rejectedPromotions ?? [],
    };
  }

  async holdOrder(dto: HoldOrderDto, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const customerInput = this.pickCustomerInput(dto);
    const customer = await this.resolveCustomerBeforePricing(storeId, customerInput);
    const orderDraft = await this.buildOrderDraft(dto, currentUser, customer?.customerId);
    const order = await this.prisma.$transaction(
      async (tx) => {
        const pickupNumber = await this.createPickupNumber(tx);
        const created = await tx.order.create({
          data: {
            orderNumber: this.createOrderNumber(),
            storeId,
            pickupNumber,
            customerId: customer?.customerId,
            customerPhoneSnapshot: customer?.customerPhoneSnapshot,
            customerNameSnapshot: customer?.customerNameSnapshot,
            orderType: orderDraft.orderType,
            status: OrderStatus.HELD,
            currency: orderDraft.currency,
            subtotal: orderDraft.subtotal,
            adjustment: orderDraft.adjustment,
            promotionDiscountAmount: orderDraft.promotionDiscountAmount,
            manualDiscountAmount: orderDraft.manualDiscountAmount,
            totalDiscountAmount: orderDraft.totalDiscountAmount,
            appliedPromotions: orderDraft.appliedPromotions as unknown as Prisma.InputJsonValue,
            adjustmentType: orderDraft.adjustmentType,
            adjustmentValue: orderDraft.adjustmentValue,
            discountReason: orderDraft.discountReason,
            taxRate: orderDraft.taxRate,
            tax: orderDraft.tax,
            serviceChargeRate: orderDraft.serviceChargeRate,
            serviceCharge: orderDraft.serviceCharge,
            tip: orderDraft.tip,
            total: orderDraft.total,
            heldAt: new Date(),
            items: { create: orderDraft.items },
          },
          include: this.orderListInclude(),
        });
        await tx.orderAuditLog.create({
          data: {
            storeId,
            orderId: created.id,
            action: OrderAuditAction.HELD,
            fromStatus: OrderStatus.OPEN,
            toStatus: OrderStatus.HELD,
            reason: 'Order held',
            operatorId: currentUser?.id,
          },
        });
        return created;
      },
      { maxWait: 30000, timeout: 60000 },
    );
    return presentOrder(order);
  }

  async resumeOrder(id: string, currentUser?: AuthRequestUser) {
    const order = await this.findOrder(id);
    if (order.status !== OrderStatus.HELD) {
      throw new BadRequestException('Only held orders can be resumed.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const resumed = await tx.order.update({
        where: { id },
        data: { status: OrderStatus.OPEN, resumedAt: new Date() },
        include: this.orderInclude(),
      });
      await tx.orderAuditLog.create({
        data: {
          storeId: this.getStoreId(),
          orderId: id,
          action: OrderAuditAction.RESUMED,
          fromStatus: OrderStatus.HELD,
          toStatus: OrderStatus.OPEN,
          reason: 'Order resumed',
          operatorId: currentUser?.id,
        },
      });
      return resumed;
    });
    return presentOrder(updated);
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

  async payOrder(id: string, dto: PayOrderDto, currentUser?: AuthRequestUser) {
    const order = await this.findOrder(id);
    if (order.status === OrderStatus.PAID) {
      return presentOrder(order);
    }
    if (order.status !== OrderStatus.OPEN) {
      throw new BadRequestException('Only open orders can be paid.');
    }
    const activeShift = await this.resolveCheckoutShift(currentUser);
    const paymentResult = validatePaymentLines(dto.payments, order.total);
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const customer =
          (await this.customersService?.resolveOrderCustomer(tx, this.getStoreId(), this.pickCustomerInput(dto))) ??
          (order.customerId
            ? {
                customerId: order.customerId,
                customerPhoneSnapshot: order.customerPhoneSnapshot ?? '',
                customerNameSnapshot: order.customerNameSnapshot,
              }
            : null);
        const paid = await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.PAID,
            customerId: customer?.customerId,
            customerPhoneSnapshot: customer?.customerPhoneSnapshot,
            customerNameSnapshot: customer?.customerNameSnapshot,
            paymentMethod: paymentResult.summaryMethod,
            cashReceived: paymentResult.cashReceived,
            changeDue: paymentResult.changeDue,
            paidAt: new Date(),
            payments: { create: paymentResult.lines },
          },
          include: this.orderListInclude(),
        });
        if (activeShift?.id && this.shiftsService) {
          await this.shiftsService.recordCashSaleMovements(tx, {
            storeId: this.getStoreId(),
            shiftId: activeShift.id,
            orderId: id,
            payments: paid.payments,
            createdByUserId: currentUser?.id,
          });
        }
        await this.customersService?.recordPaidOrder(tx, {
          storeId: this.getStoreId(),
          customerId: customer?.customerId,
          orderId: paid.id,
          orderTotal: paid.total,
          paidAt: paid.paidAt ?? new Date(),
          createdByUserId: currentUser?.id,
        });
        return tx.order.findUniqueOrThrow({ where: { id: paid.id }, include: this.orderListInclude() });
      },
      { maxWait: 30000, timeout: 60000 },
    );
    await this.printService?.createAutoJobsForOrder(updated.id).catch(() => undefined);
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
    if (getRefundedAmount(order).greaterThan(0)) {
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
    if (order.status === OrderStatus.HELD) {
      throw new BadRequestException('Held orders cannot be refunded.');
    }
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Only paid orders can be refunded.');
    }

    const refundPlan = buildRefundPlan(order, dto);
    const updatedStatus = resolveRefundedStatus(order, refundPlan.amount);
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
        await this.customersService?.recordRefundAdjustment(tx, {
          storeId,
          customerId: order.customerId,
          orderId: order.id,
          refundAmount: refundPlan.amount,
          createdByUserId: currentUser?.id,
        });
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
      table: true,
      items: { include: { product: true, refundItems: true } },
      payments: true,
      refunds: { include: { items: true } },
      auditLogs: true,
      kitchenTickets: { include: { station: true } },
    } satisfies Prisma.OrderInclude;
  }

  private orderListInclude() {
    return { table: true, items: { include: { product: true } }, payments: true, refunds: { include: { items: true } }, kitchenTickets: { include: { station: true } } } satisfies Prisma.OrderInclude;
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
    orderType: OrderType;
    subtotal: Decimal;
    adjustment: Decimal;
    promotionDiscountAmount: Decimal;
    manualDiscountAmount: Decimal;
    totalDiscountAmount: Decimal;
    appliedPromotions: Array<{ id: string; name: string; type: string; promoCode: string | null; discountAmount: number }>;
    adjustmentType?: string;
    adjustmentValue?: Decimal;
    discountReason?: string;
    taxRate: Decimal;
    tax: Decimal;
    serviceChargeRate: Decimal;
    serviceCharge: Decimal;
    tip: Decimal;
    total: Decimal;
    paymentResult: PaymentValidationResult;
    shiftId?: string;
    createdByUserId?: string;
    customerInput?: {
      customerId?: string;
      customerPhone?: string;
      customerName?: string;
    };
    customer?: ResolvedOrderCustomer | null;
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
            const customer = input.customer ?? (await this.customersService?.resolveOrderCustomer(tx, input.storeId, input.customerInput ?? {}));
            const pickupNumber = await this.createPickupNumber(tx);
            const order = await tx.order.create({
              data: {
                orderNumber: this.createOrderNumber(),
                storeId: input.storeId,
                pickupNumber,
                customerId: customer?.customerId,
                customerPhoneSnapshot: customer?.customerPhoneSnapshot,
                customerNameSnapshot: customer?.customerNameSnapshot,
                orderType: input.orderType,
                status: OrderStatus.PAID,
                paymentMethod: input.paymentResult.summaryMethod,
                currency: input.currency,
                subtotal: input.subtotal,
                adjustment: input.adjustment,
                promotionDiscountAmount: input.promotionDiscountAmount,
                manualDiscountAmount: input.manualDiscountAmount,
                totalDiscountAmount: input.totalDiscountAmount,
                appliedPromotions: input.appliedPromotions as unknown as Prisma.InputJsonValue,
                adjustmentType: input.adjustmentType,
                adjustmentValue: input.adjustmentValue,
                discountReason: input.discountReason,
                taxRate: input.taxRate,
                tax: input.tax,
                serviceChargeRate: input.serviceChargeRate,
                serviceCharge: input.serviceCharge,
                tip: input.tip,
                total: input.total,
                cashReceived: input.paymentResult.cashReceived,
                changeDue: input.paymentResult.changeDue,
                paidAt: new Date(),
                items: { create: input.items },
                payments: { create: input.paymentResult.lines },
              },
              include: this.orderListInclude(),
            });
            for (const promotion of input.appliedPromotions) {
              await tx.campaign.update({
                where: { id: promotion.id },
                data: {
                  usageCount: { increment: 1 },
                  discountTotal: { increment: promotion.discountAmount },
                },
              });
            }
            if (input.shiftId && this.shiftsService) {
              await this.shiftsService.recordCashSaleMovements(tx, {
                storeId: input.storeId,
                shiftId: input.shiftId,
                orderId: order.id,
                payments: order.payments,
                createdByUserId: input.createdByUserId,
              });
            }
            await this.customersService?.recordPaidOrder(tx, {
              storeId: input.storeId,
              customerId: customer?.customerId,
              orderId: order.id,
              orderTotal: order.total,
              paidAt: order.paidAt ?? new Date(),
              createdByUserId: input.createdByUserId,
            });
            if (this.kitchenService) {
              await this.kitchenService.generateTicketsForOrder(tx, {
                storeId: input.storeId,
                orderId: order.id,
                createdByUserId: input.createdByUserId,
              });
            }
            return tx.order.findUniqueOrThrow({
              where: { id: order.id },
              include: this.orderListInclude(),
            });
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

  private pickCustomerInput(dto: Pick<CreateOrderDto, 'customerId' | 'customerPhone' | 'customerName'>) {
    return {
      customerId: dto.customerId,
      customerPhone: dto.customerPhone,
      customerName: dto.customerName,
    };
  }

  private async resolveCustomerBeforePricing(storeId: string, input: { customerId?: string; customerPhone?: string; customerName?: string }) {
    if (!this.customersService || (!input.customerId && !input.customerPhone?.trim())) {
      return null;
    }
    return this.prisma.$transaction((tx) => this.customersService!.resolveOrderCustomer(tx, storeId, input));
  }

  private async buildOrderDraft(
    dto: Pick<CreateOrderDto, 'items' | 'orderType' | 'currency' | 'adjustment' | 'tax' | 'taxRate' | 'serviceCharge' | 'serviceChargeRate' | 'tip' | 'promoCode' | 'selectedPromotionIds'>,
    currentUser?: AuthRequestUser,
    resolvedCustomerId?: string | null,
    options: { includePreviewDetails?: boolean } = {},
  ) {
    const storeId = this.getStoreId();
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId, isActive: true, availabilityStatus: ProductAvailabilityStatus.AVAILABLE },
      include: {
        modifierGroups: {
          where: { status: 'ACTIVE' },
          include: { options: { where: { status: { not: ModifierOptionStatus.INACTIVE } }, orderBy: { displayOrder: 'asc' } } },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const missingIds = productIds.filter((id) => !productById.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Product not found, inactive, or sold out: ${missingIds.join(', ')}`);
    }

    const items = dto.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product not found, inactive, or sold out: ${item.productId}`);
      }
      const selectedModifiers = this.resolveSelectedModifiers(product, item.modifiers ?? []);
      const unitPrice = selectedModifiers.reduce((price, modifier) => price.plus(modifier.priceDelta), product.price).toDecimalPlaces(2);
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        productCategorySnapshot: product.category,
        quantity: item.quantity,
        unitPrice,
        lineTotal: multiplyMoney(unitPrice, item.quantity),
        modifiers: selectedModifiers,
      };
    });

    const subtotal = items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0)).toDecimalPlaces(2);
    this.assertDiscountPermission(subtotal, dto.adjustment, currentUser);
    const promotionResult = await evaluateCheckoutPromotions(this.prisma, {
      storeId,
      subtotal,
      items,
      promoCode: dto.promoCode,
      selectedPromotionIds: dto.selectedPromotionIds,
      resolvedCustomerId,
    }, {
      includePreviewDetails: options.includePreviewDetails,
      throwOnExplicitIneligible: !options.includePreviewDetails,
    });
    const pricing = buildCheckoutPricing({ ...dto, subtotal, promotionDiscountAmount: promotionResult.discountAmount });

    return {
      currency: dto.currency ?? products[0]?.currency ?? 'USD',
      orderType: (dto.orderType ?? OrderType.TAKEAWAY) as OrderType,
      subtotal,
      adjustment: pricing.adjustment,
      promotionDiscountAmount: pricing.promotionDiscountAmount,
      manualDiscountAmount: pricing.manualDiscountAmount,
      totalDiscountAmount: pricing.totalDiscountAmount,
      appliedPromotions: promotionResult.appliedPromotions,
      eligiblePromotions: promotionResult.eligiblePromotions,
      rejectedPromotions: promotionResult.rejectedPromotions,
      adjustmentType: pricing.adjustmentType,
      adjustmentValue: pricing.adjustmentValue,
      discountReason: pricing.discountReason,
      taxRate: pricing.taxRate,
      tax: pricing.tax,
      serviceChargeRate: pricing.serviceChargeRate,
      serviceCharge: pricing.serviceCharge,
      tip: pricing.tip,
      total: pricing.total,
      items,
    };
  }

  private async lookupCustomerForPreview(storeId: string, input: { customerId?: string; customerPhone?: string; customerName?: string }) {
    if (input.customerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, storeId } });
      if (!customer) {
        throw new BadRequestException('Customer does not belong to the active store.');
      }
      if (customer.status === CustomerStatus.BLOCKED) {
        throw new BadRequestException('Customer is blocked.');
      }
      return {
        customer: {
          id: customer.id,
          phone: customer.phone,
          name: customer.name,
          pointsBalance: customer.pointsBalance,
          orderCount: customer.orderCount,
          totalSpend: toMoneyNumber(customer.totalSpend),
          lastOrderAt: customer.lastOrderAt,
        },
        lookup: { found: true, normalizedPhone: customer.normalizedPhone },
      };
    }

    const phone = input.customerPhone?.trim();
    if (!phone || !this.customersService) {
      return { customer: null, lookup: { found: false, normalizedPhone: phone ? null : undefined } };
    }
    const normalizedPhone = this.customersService.normalizePhone(phone);
    const customer = await this.prisma.customer.findUnique({ where: { storeId_normalizedPhone: { storeId, normalizedPhone } } });
    if (!customer) {
      return { customer: null, lookup: { found: false, normalizedPhone } };
    }
    if (customer.status === CustomerStatus.BLOCKED) {
      throw new BadRequestException('Customer is blocked.');
    }
    return {
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        pointsBalance: customer.pointsBalance,
        orderCount: customer.orderCount,
        totalSpend: toMoneyNumber(customer.totalSpend),
        lastOrderAt: customer.lastOrderAt,
      },
      lookup: { found: true, normalizedPhone },
    };
  }

  private assertDiscountPermission(subtotal: Decimal, adjustment: CreateOrderDto['adjustment'], currentUser?: AuthRequestUser) {
    if (!adjustment) return;
    const result = calculateManualAdjustment(subtotal, adjustment);
    const ratio = subtotal.equals(0) ? new Decimal(0) : result.amount.div(subtotal).mul(100);
    if (ratio.greaterThan(30) && currentUser?.role !== StoreRole.OWNER && currentUser?.role !== StoreRole.MANAGER) {
      throw new BadRequestException({
        code: 'MANAGER_APPROVAL_REQUIRED',
        message: 'Manager approval is required for discounts above 30%.',
      });
    }
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
