import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BossDashboardFallback } from './boss-dashboard-fallback';
import type { BossRange } from './boss-dashboard.types';
import type { BusinessDailyMetrics } from '../business-daily/business-daily.types';

describe('BossDashboardFallback', () => {
  it('generates trend, health score, and evidence-backed sections', () => {
    const fallback = new BossDashboardFallback();
    const report = fallback.buildDashboard({ range: testRange(), current: metrics({ netSales: 1200, orderCount: 12, overdueTicketCount: 1 }), previous: metrics({ netSales: 900, orderCount: 9 }), fallback: true });
    const evidenceIds = new Set(report.evidence.map((item) => item.id));

    assert.equal(report.trend.netSales.direction, 'UP');
    assert.equal(typeof report.healthScore, 'number');
    assert.ok(report.healthScore >= 0 && report.healthScore <= 100);
    assert.ok(report.headline.length > 0);
    for (const section of [...report.insights, ...report.risks, ...report.nextActions]) {
      assert.ok(section.evidenceIds.length > 0);
      assert.ok(section.evidenceIds.every((id) => evidenceIds.has(id)));
    }
  });

  it('generates weekly insight with required evidence-backed action lists', () => {
    const fallback = new BossDashboardFallback();
    const report = fallback.buildWeekly({ range: testRange(), current: metrics({ netSales: 1000, orderCount: 10, campaignUsageCount: 2 }), previous: metrics({ netSales: 950, orderCount: 9 }), fallback: true });
    const evidenceIds = new Set(report.evidence.map((item) => item.id));

    assert.equal(report.week.start, '2026-07-27');
    assert.ok(report.summary.length > 0);
    assert.ok(report.trendExplanations.length > 0);
    assert.ok(report.nextWeekActions.length >= 3);
    for (const section of [...report.summary, ...report.highlights, ...report.risks, ...report.trendExplanations, ...report.nextWeekActions, ...report.campaignSuggestions]) {
      assert.ok(section.evidenceIds.length > 0);
      assert.ok(section.evidenceIds.every((id) => evidenceIds.has(id)));
    }
  });
});

function testRange(): BossRange {
  return {
    from: '2026-07-27',
    to: '2026-08-02',
    timezone: 'Asia/Shanghai',
    preset: 'last7days',
    start: new Date('2026-07-26T16:00:00.000Z'),
    end: new Date('2026-08-02T15:59:59.999Z'),
  };
}

function metrics(overrides: Partial<{ netSales: number; orderCount: number; overdueTicketCount: number; campaignUsageCount: number }> = {}): BusinessDailyMetrics {
  const orderCount = overrides.orderCount ?? 0;
  const netSales = overrides.netSales ?? 0;
  return {
    sales: {
      grossSales: netSales,
      netSales,
      refundTotal: 0,
      discountTotal: 0,
      promotionDiscountTotal: 0,
      manualDiscountTotal: 0,
      orderCount,
      averageOrderValue: orderCount > 0 ? netSales / orderCount : 0,
    },
    product: {
      topProducts: [{ productId: 'p1', name: 'Latte', quantitySold: 8, netSales: 80 }],
      lowSellingProducts: [{ productId: 'p2', name: 'Muffin', quantitySold: 0, netSales: 0 }],
      soldOutProducts: [],
      inactiveProducts: [],
      productsWithHighModifierUsage: [],
    },
    customer: {
      newCustomerCount: 2,
      repeatCustomerCount: 3,
      repeatRate: 0.3,
      topCustomers: [],
      dormantCustomers: [{ customerId: 'c1', name: 'Ada', phone: '+10000000000', lastOrderAt: '2026-06-01T00:00:00.000Z' }],
      loyaltyPointsIssued: 10,
    },
    campaign: {
      activeCampaignCount: 1,
      campaignUsageCount: overrides.campaignUsageCount ?? 0,
      campaignDiscountTotal: 5,
      topCampaigns: [],
      campaignsNearUsageLimit: [],
    },
    kitchen: {
      ticketCount: 4,
      readyTicketCount: 3,
      cancelledTicketCount: 0,
      overdueTicketCount: overrides.overdueTicketCount ?? 0,
      averageWaitMinutes: 6,
      averageCookMinutes: 7,
      topOverdueStations: [],
      urgentTicketCount: 1,
    },
    table: {
      dineInOrderCount: 4,
      tableOrderCount: 4,
      averageTableDuration: 35,
      topTablesBySales: [],
      cancelledTableOrderCount: 0,
    },
    refundApproval: {
      refundCount: 0,
      refundTotal: 0,
      managerApprovalCount: 1,
      voidCount: 0,
      cashOutCount: 0,
      manualDiscountApprovalCount: 0,
    },
  };
}
