import type { DiningTable, KitchenStation, KitchenTicket, Order, OrderAuditLog, OrderItem, OrderPayment, Product, Refund, RefundItem } from '@prisma/client';

import { toMoneyNumber } from './money';

type OrderWithItems = Order & {
  items: Array<OrderItem & { product: Product; refundItems?: RefundItem[] }>;
  payments?: OrderPayment[];
  refunds?: Array<Refund & { items?: RefundItem[] }>;
  auditLogs?: OrderAuditLog[];
  kitchenTickets?: Array<KitchenTicket & { station?: KitchenStation }>;
  table?: DiningTable | null;
};

export function presentOrder(order: OrderWithItems) {
  const kitchenTickets = order.kitchenTickets ?? [];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    pickupNumber: order.pickupNumber,
    orderType: 'orderType' in order ? order.orderType : 'TAKEAWAY',
    tableId: order.tableId ?? null,
    tableName: order.table?.name ?? null,
    guestCount: order.guestCount ?? null,
    status: order.status,
    printStatus: order.printStatus,
    paymentMethod: order.paymentMethod,
    currency: order.currency,
    subtotal: toMoneyNumber(order.subtotal),
    adjustment: toMoneyNumber(order.adjustment),
    adjustmentType: order.adjustmentType,
    adjustmentValue: order.adjustmentValue === null ? null : toMoneyNumber(order.adjustmentValue),
    discountReason: 'discountReason' in order ? order.discountReason : null,
    taxRate: 'taxRate' in order ? toMoneyNumber(order.taxRate) : 0,
    tax: toMoneyNumber(order.tax),
    serviceChargeRate: 'serviceChargeRate' in order ? toMoneyNumber(order.serviceChargeRate) : 0,
    serviceCharge: 'serviceCharge' in order ? toMoneyNumber(order.serviceCharge) : 0,
    tip: toMoneyNumber(order.tip),
    total: toMoneyNumber(order.total),
    cashReceived: order.cashReceived === null ? null : toMoneyNumber(order.cashReceived),
    changeDue: order.changeDue === null ? null : toMoneyNumber(order.changeDue),
    paidAt: order.paidAt?.toISOString() ?? null,
    printedAt: order.printedAt?.toISOString() ?? null,
    heldAt: 'heldAt' in order ? order.heldAt?.toISOString() ?? null : null,
    resumedAt: 'resumedAt' in order ? order.resumedAt?.toISOString() ?? null : null,
    openedAt: 'openedAt' in order ? order.openedAt?.toISOString() ?? null : null,
    closedAt: 'closedAt' in order ? order.closedAt?.toISOString() ?? null : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    refundedTotal: toMoneyNumber((order.refunds ?? []).reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0)),
    payments: (order.payments ?? []).map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: toMoneyNumber(payment.amount),
      amountReceived: payment.amountReceived == null ? null : toMoneyNumber(payment.amountReceived),
      changeDue: payment.changeDue == null ? null : toMoneyNumber(payment.changeDue),
    })),
    refunds: (order.refunds ?? []).map((refund) => ({
      id: refund.id,
      refundNumber: refund.refundNumber,
      status: refund.status,
      method: refund.method,
      amount: toMoneyNumber(refund.amount),
      reason: refund.reason,
      operatorId: refund.operatorId,
      approvedById: refund.approvedById,
      createdAt: refund.createdAt.toISOString(),
      items: (refund.items ?? []).map((item) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        amount: toMoneyNumber(item.amount),
      })),
    })),
    auditLogs: (order.auditLogs ?? []).map((log) => ({
      id: log.id,
      action: log.action,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      amount: log.amount === null ? null : toMoneyNumber(log.amount),
      reason: log.reason,
      operatorId: log.operatorId,
      approvedById: log.approvedById,
      createdAt: log.createdAt.toISOString(),
    })),
    kitchenTickets: kitchenTickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      stationId: ticket.stationId,
      stationName: ticket.station?.name ?? null,
      startedAt: ticket.startedAt?.toISOString() ?? null,
      readyAt: ticket.readyAt?.toISOString() ?? null,
      completedAt: ticket.completedAt?.toISOString() ?? null,
      cancelledAt: ticket.cancelledAt?.toISOString() ?? null,
    })),
    kitchenStatus:
      kitchenTickets.length === 0
        ? null
        : summarizeKitchenStatus(kitchenTickets.map((ticket) => ticket.status)),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.productNameSnapshot ?? item.product.name,
      category: item.productCategorySnapshot ?? item.product.category,
      quantity: item.quantity,
      unitPrice: toMoneyNumber(item.unitPrice),
      lineTotal: toMoneyNumber(item.lineTotal),
      refundedQuantity: (item.refundItems ?? []).reduce((sum, refundItem) => sum + refundItem.quantity, 0),
      modifiers: item.modifiers ?? [],
    })),
  };
}

function summarizeKitchenStatus(statuses: string[]) {
  if (statuses.every((status) => status === 'COMPLETED')) {
    return 'COMPLETED';
  }
  if (statuses.some((status) => status === 'READY')) {
    return 'READY';
  }
  if (statuses.some((status) => status === 'PREPARING')) {
    return 'PREPARING';
  }
  if (statuses.every((status) => status === 'CANCELLED')) {
    return 'CANCELLED';
  }
  return 'NEW';
}
