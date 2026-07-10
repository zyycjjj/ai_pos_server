import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCategoryShares,
  applyProductMetrics,
  buildInsightSignals,
  buildSalesMetric,
  changePercent,
  compareSalesMetrics,
  durationMinutes,
  modifierAttachRate,
} from './analytics-math';

test('net sales equals gross sales minus completed refunds', () => {
  assert.deepEqual(buildSalesMetric({ grossSales: 100, refundTotal: 20, orderCount: 4, unitsSold: 7 }), {
    grossSales: 100,
    refundTotal: 20,
    netSales: 80,
    orderCount: 4,
    paidOrderCount: 4,
    averageTicket: 20,
    unitsSold: 7,
  });
});

test('previous zero produces null change instead of Infinity', () => {
  assert.equal(changePercent(20, 0), null);
  assert.equal(compareSalesMetrics(
    buildSalesMetric({ grossSales: 20, refundTotal: 0, orderCount: 1, unitsSold: 1 }),
    buildSalesMetric({ grossSales: 0, refundTotal: 0, orderCount: 0, unitsSold: 0 }),
  ).comparisonAvailable, false);
});

test('previous period comparison uses server-side arithmetic', () => {
  assert.equal(changePercent(120, 100), 20);
  assert.equal(changePercent(80, 100), -20);
});

test('product ranking inputs preserve refund-adjusted sales and penetration', () => {
  const metrics = applyProductMetrics({
    rows: [
      { productId: 'latte', name: 'Iced Latte', category: 'Coffee', unitsSold: 10, orderCount: 8, grossSales: 60 },
      { productId: 'americano', name: 'Americano', category: 'Coffee', unitsSold: 5, orderCount: 5, grossSales: 20 },
    ],
    refunds: new Map([['latte', 10]]),
    previousSales: new Map([['latte', 40], ['americano', 20]]),
    totalOrders: 10,
  });
  assert.equal(metrics[0].netSales, 50);
  assert.equal(metrics[0].orderPenetration, 0.8);
  assert.equal(metrics[0].changePercent, 25);
  assert.equal([...metrics].sort((a, b) => b.netSales - a.netSales)[0].productId, 'latte');
});

test('category share is calculated from category net sales', () => {
  const metrics = applyCategoryShares([
    { categoryId: null, name: 'Coffee', unitsSold: 10, grossSales: 80, refundAmount: 0, netSales: 80 },
    { categoryId: null, name: 'Food', unitsSold: 5, grossSales: 20, refundAmount: 0, netSales: 20 },
  ], new Map());
  assert.equal(metrics[0].sharePercent, 80);
  assert.equal(metrics[1].sharePercent, 20);
});

test('modifier attach rate uses eligible product items as denominator', () => {
  assert.equal(modifierAttachRate(68, 100), 0.68);
  assert.equal(modifierAttachRate(1, 0), 0);
});

test('refund rate formula is refund total divided by gross sales', () => {
  const grossSales = 100;
  const refundTotal = 20;
  assert.equal(refundTotal / grossSales, 0.2);
});

test('kitchen durations use timestamp differences and ignore missing timestamps', () => {
  assert.equal(durationMinutes(new Date('2026-07-10T10:02:00Z'), new Date('2026-07-10T10:08:00Z')), 6);
  assert.equal(durationMinutes(null, new Date()), null);
});

test('signals are deterministic and do not depend on an LLM', () => {
  const signals = buildInsightSignals({
    current: buildSalesMetric({ grossSales: 80, refundTotal: 0, orderCount: 8, unitsSold: 8 }),
    previous: buildSalesMetric({ grossSales: 100, refundTotal: 0, orderCount: 10, unitsSold: 10 }),
    products: [],
    refundRate: 0,
    previousRefundRate: 0,
    shifts: [],
    kitchen: [],
  });
  assert.ok(signals.some((signal) => signal.type === 'SALES_DOWN' && signal.changePercent === -20));
});

