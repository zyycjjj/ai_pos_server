import type { BusinessDailyReport } from '../business-daily/business-daily.types';
import type { BossDashboardReport } from '../boss-dashboard/boss-dashboard.types';
import type { BusinessQueryEvidence, BusinessQueryIntent } from './business-query.types';

const intentEvidenceTypes: Record<BusinessQueryIntent, BusinessQueryEvidence['type'][]> = {
  SALES_ANALYSIS: ['METRIC', 'SALES', 'TREND', 'PRODUCT', 'TABLE'],
  REFUND_ANALYSIS: ['REFUND', 'APPROVAL', 'ORDER', 'PRODUCT', 'METRIC'],
  PRODUCT_ANALYSIS: ['PRODUCT', 'METRIC', 'SALES'],
  CUSTOMER_ANALYSIS: ['CUSTOMER', 'METRIC', 'CAMPAIGN'],
  CAMPAIGN_ANALYSIS: ['CAMPAIGN', 'DISCOUNT', 'METRIC', 'CUSTOMER'],
  KITCHEN_ANALYSIS: ['KITCHEN', 'METRIC', 'TREND'],
  TABLE_ANALYSIS: ['TABLE', 'METRIC', 'TREND'],
  APPROVAL_ANALYSIS: ['APPROVAL', 'REFUND', 'DISCOUNT', 'SHIFT', 'METRIC'],
  GENERAL_BUSINESS_SUMMARY: ['METRIC', 'TREND', 'SCORE', 'SALES', 'PRODUCT', 'CUSTOMER', 'CAMPAIGN', 'KITCHEN', 'TABLE', 'REFUND', 'APPROVAL'],
  UNSUPPORTED: ['METRIC'],
};

export function buildBusinessQueryEvidence(intent: BusinessQueryIntent, daily: BusinessDailyReport, boss?: BossDashboardReport): BusinessQueryEvidence[] {
  if (intent === 'UNSUPPORTED') {
    return [{ id: 'query_ev_guard_001', type: 'METRIC', title: 'Business query safety guard', value: 'unsupported', detail: { allowedIntents: Object.keys(intentEvidenceTypes).filter((item) => item !== 'UNSUPPORTED') } }];
  }

  const evidence: BusinessQueryEvidence[] = [];
  const allowedTypes = new Set(intentEvidenceTypes[intent]);
  for (const item of daily.evidence) {
    if (allowedTypes.has(item.type)) evidence.push({ ...item, source: { report: 'business_daily', range: daily.range } });
  }
  if (boss) {
    for (const item of boss.evidence) {
      if (allowedTypes.has(item.type as BusinessQueryEvidence['type'])) {
        evidence.push({ ...item, type: item.type as BusinessQueryEvidence['type'], source: { report: 'boss_dashboard', range: boss.range } });
      }
    }
  }

  const metricEvidence = metricEvidenceForIntent(intent, daily, boss);
  return dedupeEvidence([...metricEvidence, ...evidence]).slice(0, 18);
}

function metricEvidenceForIntent(intent: BusinessQueryIntent, daily: BusinessDailyReport, boss?: BossDashboardReport): BusinessQueryEvidence[] {
  const metrics = daily.metrics;
  const rows: BusinessQueryEvidence[] = [];
  const add = (id: string, type: BusinessQueryEvidence['type'], title: string, value: unknown, detail?: Record<string, unknown>) => {
    rows.push({ id, type, title, value: typeof value === 'number' || typeof value === 'string' || value === null ? value : null, detail: { ...detail, raw: value }, source: { report: 'business_daily', range: daily.range } });
  };

  if (intent === 'SALES_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_sales_net', 'METRIC', 'Net sales', metrics.sales.netSales, { grossSales: metrics.sales.grossSales, orderCount: metrics.sales.orderCount, averageOrderValue: metrics.sales.averageOrderValue, trend: boss?.trend.netSales });
    add('query_ev_sales_orders', 'METRIC', 'Order count', metrics.sales.orderCount, { averageOrderValue: metrics.sales.averageOrderValue, trend: boss?.trend.orderCount });
  }
  if (intent === 'REFUND_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_refund_total', 'REFUND', 'Refund total', metrics.refundApproval.refundTotal, { refundCount: metrics.refundApproval.refundCount, trend: boss?.trend.refundTotal });
  }
  if (intent === 'PRODUCT_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_product_top', 'PRODUCT', 'Top products', metrics.product.topProducts[0]?.netSales ?? 0, { topProducts: metrics.product.topProducts, lowSellingProducts: metrics.product.lowSellingProducts, soldOutProducts: metrics.product.soldOutProducts });
  }
  if (intent === 'CUSTOMER_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_customer_repeat', 'CUSTOMER', 'Customer repeat rate', metrics.customer.repeatRate, { newCustomerCount: metrics.customer.newCustomerCount, repeatCustomerCount: metrics.customer.repeatCustomerCount, topCustomers: metrics.customer.topCustomers, dormantCustomers: metrics.customer.dormantCustomers });
  }
  if (intent === 'CAMPAIGN_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_campaign_usage', 'CAMPAIGN', 'Campaign usage', metrics.campaign.campaignUsageCount, { activeCampaignCount: metrics.campaign.activeCampaignCount, campaignDiscountTotal: metrics.campaign.campaignDiscountTotal, topCampaigns: metrics.campaign.topCampaigns });
  }
  if (intent === 'KITCHEN_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_kitchen_sla', 'KITCHEN', 'Kitchen SLA', metrics.kitchen.overdueTicketCount, { ticketCount: metrics.kitchen.ticketCount, averageWaitMinutes: metrics.kitchen.averageWaitMinutes, averageCookMinutes: metrics.kitchen.averageCookMinutes, urgentTicketCount: metrics.kitchen.urgentTicketCount, topOverdueStations: metrics.kitchen.topOverdueStations, trend: boss?.trend.kitchenOverdueRate });
  }
  if (intent === 'TABLE_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_table_orders', 'TABLE', 'Table orders', metrics.table.tableOrderCount, { dineInOrderCount: metrics.table.dineInOrderCount, averageTableDuration: metrics.table.averageTableDuration, topTablesBySales: metrics.table.topTablesBySales, cancelledTableOrderCount: metrics.table.cancelledTableOrderCount });
  }
  if (intent === 'APPROVAL_ANALYSIS' || intent === 'GENERAL_BUSINESS_SUMMARY') {
    add('query_ev_approval_count', 'APPROVAL', 'Manager approvals', metrics.refundApproval.managerApprovalCount, { manualDiscountApprovalCount: metrics.refundApproval.manualDiscountApprovalCount, cashOutCount: metrics.refundApproval.cashOutCount, voidCount: metrics.refundApproval.voidCount, trend: boss?.trend.managerApprovalCount });
  }
  return rows;
}

function dedupeEvidence(items: BusinessQueryEvidence[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
