import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BusinessQueryFallback } from './business-query-fallback';
import { classifyBusinessQueryIntent } from './business-query-intent';
import type { BusinessQueryEvidence } from './business-query.types';
import type { BusinessDailyReport } from '../business-daily/business-daily.types';

describe('business query intent classification', () => {
  it('classifies supported business questions with deterministic rules', () => {
    assert.equal(classifyBusinessQueryIntent('今天为什么退款变多了？'), 'REFUND_ANALYSIS');
    assert.equal(classifyBusinessQueryIntent('哪个商品最近卖得最好？'), 'PRODUCT_ANALYSIS');
    assert.equal(classifyBusinessQueryIntent('哪个顾客值得召回？'), 'CUSTOMER_ANALYSIS');
    assert.equal(classifyBusinessQueryIntent('哪个档口最慢？'), 'KITCHEN_ANALYSIS');
    assert.equal(classifyBusinessQueryIntent('本周营业额为什么变化？'), 'SALES_ANALYSIS');
  });

  it('blocks unsafe or unsupported questions', () => {
    assert.equal(classifyBusinessQueryIntent('帮我直接删除数据库'), 'UNSUPPORTED');
    assert.equal(classifyBusinessQueryIntent('查一下其他门店的营业额'), 'UNSUPPORTED');
    assert.equal(classifyBusinessQueryIntent('帮我写代码'), 'UNSUPPORTED');
  });
});

describe('BusinessQueryFallback', () => {
  it('returns evidence-backed answer details', () => {
    const fallback = new BusinessQueryFallback();
    const evidence: BusinessQueryEvidence[] = [
      { id: 'query_ev_sales_net', type: 'METRIC', title: 'Net sales', value: 120 },
      { id: 'query_ev_product_top', type: 'PRODUCT', title: 'Top products', value: 80 },
    ];
    const answer = fallback.answer({ question: '今天营业额怎么样？', intent: 'SALES_ANALYSIS', daily: report(), evidence });

    assert.ok(answer.headline.includes('120'));
    assert.ok(answer.details.length > 0);
    for (const detail of answer.details) {
      assert.ok(detail.evidenceIds.length > 0);
      assert.ok(detail.evidenceIds.every((id) => evidence.some((item) => item.id === id)));
    }
  });
});

function report(): BusinessDailyReport {
  return {
    range: { from: '2026-07-30', to: '2026-07-30', timezone: 'Asia/Shanghai', preset: 'today' },
    summary: { text: 'summary', evidenceIds: ['ev_001'] },
    highlights: [],
    risks: [],
    metrics: {
      sales: { grossSales: 120, netSales: 120, refundTotal: 0, discountTotal: 0, promotionDiscountTotal: 0, manualDiscountTotal: 0, orderCount: 3, averageOrderValue: 40 },
      product: { topProducts: [{ productId: 'p1', name: 'Latte', quantitySold: 3, netSales: 90 }], lowSellingProducts: [], soldOutProducts: [], inactiveProducts: [], productsWithHighModifierUsage: [] },
      customer: { newCustomerCount: 1, repeatCustomerCount: 1, repeatRate: 0.33, topCustomers: [], dormantCustomers: [], loyaltyPointsIssued: 0 },
      campaign: { activeCampaignCount: 0, campaignUsageCount: 0, campaignDiscountTotal: 0, topCampaigns: [], campaignsNearUsageLimit: [] },
      kitchen: { ticketCount: 0, readyTicketCount: 0, cancelledTicketCount: 0, overdueTicketCount: 0, averageWaitMinutes: 0, averageCookMinutes: 0, topOverdueStations: [], urgentTicketCount: 0 },
      table: { dineInOrderCount: 0, tableOrderCount: 0, averageTableDuration: 0, topTablesBySales: [], cancelledTableOrderCount: 0 },
      refundApproval: { refundCount: 0, refundTotal: 0, managerApprovalCount: 0, voidCount: 0, cashOutCount: 0, manualDiscountApprovalCount: 0 },
    },
    evidence: [{ id: 'ev_001', type: 'METRIC', title: 'Net sales', value: 120 }],
    recommendations: [],
    generatedBy: 'test',
    fallback: true,
    generatedAt: '2026-07-30T00:00:00.000Z',
  };
}
