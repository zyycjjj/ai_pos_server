import type { Order, OrderItem, Product } from '@prisma/client';

import { toMoneyNumber } from './money';

type OrderWithItems = Order & {
  items: Array<OrderItem & { product: Product }>;
};

export function presentOrder(order: OrderWithItems) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    subtotal: toMoneyNumber(order.subtotal),
    tax: toMoneyNumber(order.tax),
    tip: toMoneyNumber(order.tip),
    total: toMoneyNumber(order.total),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      category: item.product.category,
      quantity: item.quantity,
      unitPrice: toMoneyNumber(item.unitPrice),
      lineTotal: toMoneyNumber(item.lineTotal),
    })),
  };
}
