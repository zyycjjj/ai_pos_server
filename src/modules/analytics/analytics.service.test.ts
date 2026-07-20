import assert from 'node:assert/strict';
import test from 'node:test';

import { AnalyticsService } from './analytics.service';

test('analytics always scopes repository reads to the active store context', async () => {
  const seenStoreIds: string[] = [];
  const metric = { grossSales: 100, refundTotal: 0, netSales: 100, orderCount: 10, paidOrderCount: 10, averageTicket: 10, unitsSold: 12 };
  const sales = {
    async getStore(storeId: string) {
      seenStoreIds.push(storeId);
      return { id: storeId, name: 'Store A', timezone: 'UTC', currency: 'USD' };
    },
    async metric(storeId: string) {
      seenStoreIds.push(storeId);
      return metric;
    },
  };
  const service = new AnalyticsService(
    { getStoreId: () => 'store-a' } as never,
    sales as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.overview({ from: '2026-07-10', to: '2026-07-10', compare: 'previous_period' });
  assert.equal(result.current.netSales, 100);
  assert.deepEqual(seenStoreIds, ['store-a', 'store-a', 'store-a']);
  assert.ok(!seenStoreIds.includes('store-b'));
});
