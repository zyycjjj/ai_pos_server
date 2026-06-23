import type { Order, OrderItem, OrderPayment, Product } from '@prisma/client';

import { toMoneyNumber } from './money';

type OrderWithItems = Order & {
  items: Array<OrderItem & { product: Product }>;
  payments?: OrderPayment[];
};

export function presentOrder(order: OrderWithItems) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    pickupNumber: order.pickupNumber,
    status: order.status,
    printStatus: order.printStatus,
    paymentMethod: order.paymentMethod,
    currency: order.currency,
    subtotal: toMoneyNumber(order.subtotal),
    adjustment: toMoneyNumber(order.adjustment),
    adjustmentType: order.adjustmentType,
    adjustmentValue: order.adjustmentValue === null ? null : toMoneyNumber(order.adjustmentValue),
    tax: toMoneyNumber(order.tax),
    tip: toMoneyNumber(order.tip),
    total: toMoneyNumber(order.total),
    cashReceived: order.cashReceived === null ? null : toMoneyNumber(order.cashReceived),
    changeDue: order.changeDue === null ? null : toMoneyNumber(order.changeDue),
    paidAt: order.paidAt?.toISOString() ?? null,
    printedAt: order.printedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    payments: (order.payments ?? []).map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: toMoneyNumber(payment.amount),
      amountReceived: payment.amountReceived == null ? null : toMoneyNumber(payment.amountReceived),
      changeDue: payment.changeDue == null ? null : toMoneyNumber(payment.changeDue),
    })),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      category: item.product.category,
      quantity: item.quantity,
      unitPrice: toMoneyNumber(item.unitPrice),
      lineTotal: toMoneyNumber(item.lineTotal),
      modifiers: item.modifiers ?? [],
    })),
  };
}
