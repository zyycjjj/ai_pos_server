import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { toMoney } from '@/common/utils/money';

import type { RefundOrderDto } from '../dto/order-action.dto';

export type RefundableOrder = {
  total: Decimal;
  refunds: Array<{ amount: Decimal }>;
  items: Array<{
    id: string;
    quantity: number;
    lineTotal: Decimal;
    refundItems: Array<{ quantity: number }>;
  }>;
};

export function getRefundedAmount(order: Pick<RefundableOrder, 'refunds'>) {
  return order.refunds.reduce((sum, refund) => sum.plus(refund.amount), new Decimal(0)).toDecimalPlaces(2);
}

export function buildRefundPlan(order: RefundableOrder, dto: RefundOrderDto) {
  // Refundable balance is derived from persisted refunds, not the POS request, so repeated or partial refunds cannot exceed the server-side paid order total.
  const remainingOrderAmount = order.total.minus(getRefundedAmount(order)).toDecimalPlaces(2);
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

export function resolveRefundedStatus(order: Pick<RefundableOrder, 'total' | 'refunds'>, newRefundAmount: Decimal) {
  const refundedAmount = getRefundedAmount(order).plus(newRefundAmount).toDecimalPlaces(2);
  if (refundedAmount.greaterThanOrEqualTo(order.total)) {
    return OrderStatus.REFUNDED;
  }
  return OrderStatus.PARTIALLY_REFUNDED;
}
