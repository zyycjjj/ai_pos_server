import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CampaignRecommendationFallback } from './campaign-recommendation-fallback';
import { validateCampaignRecommendations } from './campaign-recommendation-validator';
import type { BusinessDailyReport } from '../business-daily/business-daily.types';

describe('CampaignRecommendationFallback', () => {
  it('generates deterministic evidence-backed campaign recommendations', () => {
    const fallback = new CampaignRecommendationFallback();
    const report = fakeReport();
    const items = validateCampaignRecommendations(fallback.generate(report), report.evidence);
    const types = items.map((item) => item.type);

    assert(types.includes('CUSTOMER_REACTIVATION'));
    assert(types.includes('TOP_CUSTOMER_REWARD'));
    assert(types.includes('AOV_THRESHOLD_PROMO'));
    assert(types.includes('LOW_SELLING_PRODUCT_PROMO'));
    assert(items.every((item) => item.evidenceIds.every((id) => report.evidence.some((evidence) => evidence.id === id))));
    const threshold = items.find((item) => item.type === 'AOV_THRESHOLD_PROMO');
    assert.equal(threshold?.offer.threshold, 30);
    assert.equal(threshold?.draftPayload?.campaignType, 'THRESHOLD_DISCOUNT');
  });

  it('drops recommendations with missing evidence', () => {
    const fallback = new CampaignRecommendationFallback();
    const report = fakeReport();
    const [first] = fallback.generate(report);
    const invalid = { ...first, evidenceIds: ['missing-evidence'] };

    assert.equal(validateCampaignRecommendations([invalid], report.evidence).length, 0);
  });
});

function fakeReport(): BusinessDailyReport {
  return {
    range: { from: '2026-07-29', to: '2026-07-29', timezone: 'Asia/Shanghai', preset: 'today' },
    summary: { text: 'Summary', evidenceIds: ['ev_sales'] },
    highlights: [],
    risks: [],
    generatedBy: 'test',
    fallback: true,
    generatedAt: '2026-07-29T00:00:00.000Z',
    evidence: [
      { id: 'ev_sales', type: 'METRIC', title: 'Net sales', value: 100 },
      { id: 'ev_customer', type: 'CUSTOMER', title: 'Top customer', value: 50 },
      { id: 'ev_product', type: 'PRODUCT', title: 'Top product', value: 20 },
      { id: 'ev_kitchen', type: 'KITCHEN', title: 'Kitchen', value: 0 },
    ],
    recommendations: [],
    metrics: {
      sales: { grossSales: 100, netSales: 100, refundTotal: 0, discountTotal: 0, promotionDiscountTotal: 0, manualDiscountTotal: 0, orderCount: 4, averageOrderValue: 24 },
      product: {
        topProducts: [{ productId: 'p1', name: 'Latte', quantitySold: 4, netSales: 80 }],
        lowSellingProducts: [{ productId: 'p2', name: 'Cookie', quantitySold: 0, netSales: 0 }],
        soldOutProducts: [],
        inactiveProducts: [],
        productsWithHighModifierUsage: [],
      },
      customer: {
        newCustomerCount: 1,
        repeatCustomerCount: 1,
        repeatRate: 0.25,
        topCustomers: [{ customerId: 'c1', name: 'Ada', phone: '+14155550100', totalSpend: 100, orderCount: 3 }],
        dormantCustomers: [{ customerId: 'c2', name: 'Grace', phone: '+14155550101', lastOrderAt: '2026-06-01T00:00:00.000Z' }],
        loyaltyPointsIssued: 10,
      },
      campaign: { activeCampaignCount: 0, campaignUsageCount: 0, campaignDiscountTotal: 0, topCampaigns: [], campaignsNearUsageLimit: [] },
      kitchen: { ticketCount: 0, readyTicketCount: 0, cancelledTicketCount: 0, overdueTicketCount: 0, averageWaitMinutes: 0, averageCookMinutes: 0, topOverdueStations: [], urgentTicketCount: 0 },
      table: { dineInOrderCount: 0, tableOrderCount: 0, averageTableDuration: 0, topTablesBySales: [], cancelledTableOrderCount: 0 },
      refundApproval: { refundCount: 0, refundTotal: 0, managerApprovalCount: 0, voidCount: 0, cashOutCount: 0, manualDiscountApprovalCount: 0 },
    },
  };
}
