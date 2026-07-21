import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderStatus, PaymentMethod, RefundStatus, ShiftStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { ReportsService } from './reports.service';

describe('ReportsService aggregation', () => {
  it('summarizes paid and refunded orders while excluding non-paid states from repository input', async () => {
    const service = new ReportsService({ getStoreId: () => 'store-1' } as any, repository({
      orders: [
        order({ id: 'paid-1', total: 100, promotionDiscountAmount: 10, manualDiscountAmount: 5 }),
        order({ id: 'refunded-1', total: 50, status: OrderStatus.PARTIALLY_REFUNDED }),
      ],
      refunds: [refund({ orderId: 'refunded-1', amount: 20 })],
    }) as any);

    const summary = await service.summary({ preset: 'custom', from: '2026-07-21', to: '2026-07-21' });

    assert.equal(summary.sales.grossSales, 150);
    assert.equal(summary.sales.refundTotal, 20);
    assert.equal(summary.sales.netSales, 130);
    assert.equal(summary.sales.discountTotal, 15);
    assert.equal(summary.sales.orderCount, 2);
    assert.equal(summary.sales.averageOrderValue, 65);
  });

  it('groups payment report by payment method and subtracts refunds', async () => {
    const service = new ReportsService({ getStoreId: () => 'store-1' } as any, repository({
      orders: [order({ id: 'paid-1', total: 100, payments: [{ method: PaymentMethod.CASH, amount: 60 }, { method: PaymentMethod.CARD, amount: 40 }] })],
      refunds: [refund({ orderId: 'paid-1', amount: 10, method: PaymentMethod.CASH })],
    }) as any);

    const payments = await service.payments({ preset: 'custom', from: '2026-07-21', to: '2026-07-21' });

    assert.equal(payments.items.find((item) => item.method === 'CASH')?.netAmount, 50);
    assert.equal(payments.items.find((item) => item.method === 'CARD')?.netAmount, 40);
  });
});

function repository(input: { orders?: any[]; refunds?: any[] } = {}) {
  return {
    getStore: async () => ({ id: 'store-1', currency: 'USD' }),
    orders: async () => input.orders ?? [],
    refunds: async () => input.refunds ?? [],
    customers: async () => [],
    pointLedgers: async () => [],
    campaigns: async () => [],
    activeCustomerCampaigns: async () => [],
    shifts: async () => [],
  };
}

function order(input: Partial<any>) {
  const paidAt = new Date('2026-07-21T04:00:00.000Z');
  return {
    id: input.id ?? 'order-1',
    status: input.status ?? OrderStatus.PAID,
    paidAt,
    createdAt: paidAt,
    customerId: null,
    customer: null,
    customerNameSnapshot: null,
    customerPhoneSnapshot: null,
    total: new Decimal(input.total ?? 0),
    promotionDiscountAmount: new Decimal(input.promotionDiscountAmount ?? 0),
    manualDiscountAmount: new Decimal(input.manualDiscountAmount ?? 0),
    appliedPromotions: [],
    items: [],
    payments: (input.payments ?? [{ method: PaymentMethod.CARD, amount: input.total ?? 0 }]).map((payment: any) => ({ ...payment, amount: new Decimal(payment.amount) })),
    refunds: [],
  };
}

function refund(input: Partial<any>) {
  return {
    id: 'refund-1',
    orderId: input.orderId ?? 'order-1',
    status: RefundStatus.COMPLETED,
    method: input.method ?? PaymentMethod.CARD,
    amount: new Decimal(input.amount ?? 0),
    createdAt: new Date('2026-07-21T05:00:00.000Z'),
    items: [],
  };
}
