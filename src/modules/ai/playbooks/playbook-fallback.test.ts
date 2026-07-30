import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BusinessDailyReport } from '../business-daily/business-daily.types';
import { PLAYBOOK_DEFINITIONS } from './playbook-definitions';
import { PlaybookFallback } from './playbook-fallback';
import type { AiPlaybookEvidence } from './playbooks.types';

describe('PlaybookFallback', () => {
  it('generates evidence-backed steps and actions for every playbook', () => {
    const fallback = new PlaybookFallback();
    for (const definition of PLAYBOOK_DEFINITIONS) {
      const result = fallback.generate({
        runId: `run_${definition.type}`,
        definition,
        current: report(120, 2),
        previous: report(160, 0),
        evidence: evidence(),
      });
      const evidenceIds = new Set(result.evidence.map((item) => item.id));

      assert.equal(result.type, definition.type);
      assert.ok(result.steps.length >= definition.steps.length);
      assert.ok(result.recommendedActions.length > 0);
      for (const step of result.steps) {
        assert.ok(step.evidenceIds.length > 0, `${definition.type} step ${step.id} should reference evidence`);
        assert.ok(step.evidenceIds.every((id) => evidenceIds.has(id)));
      }
      for (const action of result.recommendedActions) {
        assert.ok(action.evidenceIds.length > 0, `${definition.type} action ${action.label} should reference evidence`);
        assert.ok(action.evidenceIds.every((id) => evidenceIds.has(id)));
      }
    }
  });

  it('offers campaign draft only for campaign-capable playbooks with evidence', () => {
    const fallback = new PlaybookFallback();
    const campaignDefinitions = PLAYBOOK_DEFINITIONS.filter((item) => item.campaignDraftEnabled);
    for (const definition of campaignDefinitions) {
      const result = fallback.generate({ runId: `run_${definition.type}`, definition, current: report(120, 2), previous: report(160, 0), evidence: evidence() });
      const draftAction = result.recommendedActions.find((item) => item.actionType === 'CREATE_CAMPAIGN_DRAFT');
      assert.ok(draftAction, `${definition.type} should offer campaign draft`);
      assert.ok(draftAction?.payload?.draftPayload);
    }
  });
});

function evidence(): AiPlaybookEvidence[] {
  return [
    { id: 'playbook_sales_net', type: 'METRIC', title: 'Current net sales', value: 120 },
    { id: 'playbook_sales_previous', type: 'TREND', title: 'Previous net sales', value: 160 },
    { id: 'playbook_order_count', type: 'METRIC', title: 'Order count', value: 4 },
    { id: 'playbook_aov', type: 'METRIC', title: 'AOV', value: 30 },
    { id: 'playbook_refund_total', type: 'REFUND', title: 'Refund total', value: 12 },
    { id: 'playbook_refund_previous', type: 'TREND', title: 'Previous refunds', value: 0 },
    { id: 'playbook_manager_approval', type: 'APPROVAL', title: 'Manager approvals', value: 1 },
    { id: 'query_ev_refund_order_1', type: 'ORDER', title: 'Refund order', value: 12 },
    { id: 'playbook_top_products', type: 'PRODUCT', title: 'Top products', value: 80 },
    { id: 'playbook_low_products', type: 'PRODUCT', title: 'Low products', value: 0, refId: 'p2' },
    { id: 'playbook_product_availability', type: 'PRODUCT', title: 'Availability', value: 1 },
    { id: 'playbook_table_orders', type: 'TABLE', title: 'Table orders', value: 1 },
    { id: 'playbook_repeat_rate', type: 'CUSTOMER', title: 'Repeat rate', value: 0.5 },
    { id: 'playbook_dormant_customers', type: 'CUSTOMER', title: 'Dormant customers', value: 1 },
    { id: 'playbook_top_customers', type: 'CUSTOMER', title: 'Top customers', value: 100, refId: 'c1' },
    { id: 'playbook_kitchen_sla', type: 'KITCHEN', title: 'Kitchen SLA', value: 1 },
    { id: 'playbook_overdue_stations', type: 'KITCHEN', title: 'Overdue stations', value: 1 },
    { id: 'query_ev_kitchen_ticket_1', type: 'KITCHEN', title: 'Kitchen ticket', value: 'NEW' },
  ];
}

function report(netSales: number, refundCount: number): BusinessDailyReport {
  return {
    range: { from: '2026-07-30', to: '2026-07-30', timezone: 'Asia/Shanghai', preset: 'today' },
    summary: { text: 'summary', evidenceIds: ['playbook_sales_net'] },
    highlights: [],
    risks: [],
    metrics: {
      sales: { grossSales: netSales + 12, netSales, refundTotal: refundCount * 6, discountTotal: 0, promotionDiscountTotal: 0, manualDiscountTotal: 0, orderCount: 4, averageOrderValue: netSales / 4 },
      product: { topProducts: [{ productId: 'p1', name: 'Latte', quantitySold: 4, netSales: 80 }], lowSellingProducts: [{ productId: 'p2', name: 'Cookie', quantitySold: 0, netSales: 0 }], soldOutProducts: [], inactiveProducts: [], productsWithHighModifierUsage: [] },
      customer: { newCustomerCount: 1, repeatCustomerCount: 1, repeatRate: 0.5, topCustomers: [{ customerId: 'c1', name: 'Guest', phone: '+14155550000', totalSpend: 100, orderCount: 3 }], dormantCustomers: [{ customerId: 'c2', name: 'Dormant', phone: '+14155550001', lastOrderAt: '2026-05-01T00:00:00.000Z' }], loyaltyPointsIssued: 10 },
      campaign: { activeCampaignCount: 0, campaignUsageCount: 0, campaignDiscountTotal: 0, topCampaigns: [], campaignsNearUsageLimit: [] },
      kitchen: { ticketCount: 2, readyTicketCount: 1, cancelledTicketCount: 0, overdueTicketCount: 1, averageWaitMinutes: 6, averageCookMinutes: 8, topOverdueStations: [{ stationId: 's1', name: 'Hot', overdueTicketCount: 1 }], urgentTicketCount: 1 },
      table: { dineInOrderCount: 1, tableOrderCount: 1, averageTableDuration: 30, topTablesBySales: [], cancelledTableOrderCount: 0 },
      refundApproval: { refundCount, refundTotal: refundCount * 6, managerApprovalCount: refundCount, voidCount: 0, cashOutCount: 0, manualDiscountApprovalCount: 0 },
    },
    evidence: [],
    recommendations: [],
    generatedBy: 'test',
    fallback: true,
    generatedAt: '2026-07-30T00:00:00.000Z',
  };
}
