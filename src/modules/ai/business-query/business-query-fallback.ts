import { Injectable } from '@nestjs/common';

import type { BusinessDailyReport } from '../business-daily/business-daily.types';
import type { BusinessQueryAnswer, BusinessQueryEvidence, BusinessQueryIntent, BusinessQuerySuggestedAction } from './business-query.types';

@Injectable()
export class BusinessQueryFallback {
  answer(input: { question: string; intent: BusinessQueryIntent; daily: BusinessDailyReport; evidence: BusinessQueryEvidence[] }): BusinessQueryAnswer {
    const primary = input.evidence[0];
    if (input.intent === 'UNSUPPORTED') {
      return {
        headline: 'This question is outside the current store business data scope.',
        summary: 'I can answer questions about sales, refunds, products, customers, campaigns, kitchen, tables, and approvals for the active store.',
        details: [{ title: 'Safety guard', text: 'No database action was executed and no unsupported data was queried.', evidenceIds: [primary?.id ?? 'query_ev_guard_001'] }],
        limitations: ['Unsupported requests cannot access SQL, other stores, employee private data, or perform destructive actions.'],
      };
    }
    if (!primary || input.daily.metrics.sales.orderCount === 0) {
      return {
        headline: 'data_insufficient: There is not enough paid order data for a confident answer.',
        summary: 'The system found limited store evidence in the selected range.',
        details: primary ? [{ title: 'Available evidence', text: primary.title, evidenceIds: [primary.id] }] : [],
        limitations: ['More completed orders may be needed before the answer becomes reliable.'],
      };
    }

    const metrics = input.daily.metrics;
    const templates: Record<Exclude<BusinessQueryIntent, 'UNSUPPORTED'>, BusinessQueryAnswer> = {
      SALES_ANALYSIS: {
        headline: `Net sales were ${metrics.sales.netSales.toFixed(2)} from ${metrics.sales.orderCount} paid orders.`,
        summary: `Average order value was ${metrics.sales.averageOrderValue.toFixed(2)}. Refunds were ${metrics.sales.refundTotal.toFixed(2)} and discounts were ${metrics.sales.discountTotal.toFixed(2)}.`,
        details: [
          { title: 'Sales level', text: `${metrics.sales.orderCount} orders generated ${metrics.sales.netSales.toFixed(2)} net sales.`, evidenceIds: ids(input.evidence, ['query_ev_sales_net', 'query_ev_sales_orders']) },
          { title: 'Product driver', text: metrics.product.topProducts[0] ? `${metrics.product.topProducts[0].name} was the strongest product signal.` : 'data_insufficient: No top product was available.', evidenceIds: ids(input.evidence, ['query_ev_product_top']) },
        ],
        limitations: [],
      },
      REFUND_ANALYSIS: {
        headline: `Refunds were ${metrics.refundApproval.refundTotal.toFixed(2)} across ${metrics.refundApproval.refundCount} refunds.`,
        summary: metrics.refundApproval.refundCount > 0 ? 'Review refund orders together with approval logs before changing policy.' : 'No completed refunds were found in this range.',
        details: [{ title: 'Refund signal', text: `${metrics.refundApproval.refundCount} refunds and ${metrics.refundApproval.managerApprovalCount} manager approvals were found.`, evidenceIds: ids(input.evidence, ['query_ev_refund_total', 'query_ev_approval_count']) }],
        limitations: ['Refund reason quality depends on staff-entered reasons.'],
      },
      PRODUCT_ANALYSIS: {
        headline: metrics.product.topProducts[0] ? `${metrics.product.topProducts[0].name} is currently the strongest product.` : 'data_insufficient: Product ranking is not available.',
        summary: metrics.product.lowSellingProducts[0] ? `${metrics.product.lowSellingProducts[0].name} is a low-selling product candidate for review.` : 'No low-selling product candidate was found.',
        details: [{ title: 'Product evidence', text: `${metrics.product.topProducts.length} top products and ${metrics.product.lowSellingProducts.length} low-selling products were evaluated.`, evidenceIds: ids(input.evidence, ['query_ev_product_top']) }],
        limitations: [],
      },
      CUSTOMER_ANALYSIS: {
        headline: `${metrics.customer.repeatCustomerCount} repeat customers were found in this range.`,
        summary: metrics.customer.dormantCustomers.length > 0 ? `${metrics.customer.dormantCustomers.length} dormant customers may be reviewed for a reactivation draft.` : 'No dormant customer list was available for this range.',
        details: [{ title: 'Customer evidence', text: `Repeat rate was ${(metrics.customer.repeatRate * 100).toFixed(1)}% with ${metrics.customer.newCustomerCount} new customers.`, evidenceIds: ids(input.evidence, ['query_ev_customer_repeat']) }],
        limitations: ['Customer quality depends on checkout customer capture.'],
      },
      CAMPAIGN_ANALYSIS: {
        headline: `${metrics.campaign.campaignUsageCount} campaign uses were recorded.`,
        summary: metrics.campaign.topCampaigns[0] ? `${metrics.campaign.topCampaigns[0].name} is the top campaign signal.` : 'No top campaign usage was available.',
        details: [{ title: 'Campaign evidence', text: `Active campaigns: ${metrics.campaign.activeCampaignCount}, discount total: ${metrics.campaign.campaignDiscountTotal.toFixed(2)}.`, evidenceIds: ids(input.evidence, ['query_ev_campaign_usage']) }],
        limitations: ['Campaign lift is directional and should be compared with baseline periods.'],
      },
      KITCHEN_ANALYSIS: {
        headline: `${metrics.kitchen.overdueTicketCount} overdue kitchen tickets and ${metrics.kitchen.urgentTicketCount} urgent tickets were found.`,
        summary: metrics.kitchen.topOverdueStations[0] ? `${metrics.kitchen.topOverdueStations[0].name} is the main overdue station signal.` : 'No overdue station leader was found.',
        details: [{ title: 'Kitchen SLA', text: `Average wait was ${metrics.kitchen.averageWaitMinutes} minutes and average cook was ${metrics.kitchen.averageCookMinutes} minutes.`, evidenceIds: ids(input.evidence, ['query_ev_kitchen_sla']) }],
        limitations: ['Overdue status depends on configured station SLA thresholds.'],
      },
      TABLE_ANALYSIS: {
        headline: `${metrics.table.tableOrderCount} table-linked orders were served.`,
        summary: metrics.table.topTablesBySales[0] ? `${metrics.table.topTablesBySales[0].name} was the top table by sales.` : 'No top table sales signal was available.',
        details: [{ title: 'Table evidence', text: `Dine-in orders: ${metrics.table.dineInOrderCount}, cancelled table orders: ${metrics.table.cancelledTableOrderCount}.`, evidenceIds: ids(input.evidence, ['query_ev_table_orders']) }],
        limitations: ['Average table duration requires opened and closed table timestamps.'],
      },
      APPROVAL_ANALYSIS: {
        headline: `${metrics.refundApproval.managerApprovalCount} manager approvals occurred in this range.`,
        summary: `Manual discount approvals: ${metrics.refundApproval.manualDiscountApprovalCount}, cash out events: ${metrics.refundApproval.cashOutCount}, voids: ${metrics.refundApproval.voidCount}.`,
        details: [{ title: 'Approval evidence', text: 'Review approval reasons before changing permission policy.', evidenceIds: ids(input.evidence, ['query_ev_approval_count']) }],
        limitations: ['Approver-level ranking is not exposed in this lightweight answer.'],
      },
      GENERAL_BUSINESS_SUMMARY: {
        headline: `Net sales were ${metrics.sales.netSales.toFixed(2)} with ${metrics.sales.orderCount} orders.`,
        summary: `Refunds were ${metrics.sales.refundTotal.toFixed(2)}, kitchen overdue tickets were ${metrics.kitchen.overdueTicketCount}, and approvals were ${metrics.refundApproval.managerApprovalCount}.`,
        details: [
          { title: 'Business summary', text: 'Sales, refunds, kitchen, customer, campaign, table, and approval signals were reviewed.', evidenceIds: ids(input.evidence, ['query_ev_sales_net', 'query_ev_refund_total', 'query_ev_kitchen_sla']) },
        ],
        limitations: [],
      },
    };
    return ensureDetails(templates[input.intent], input.evidence);
  }

  suggestedActions(intent: BusinessQueryIntent, evidence: BusinessQueryEvidence[]): BusinessQuerySuggestedAction[] {
    const first = evidence[0]?.id;
    const action = (kind: BusinessQuerySuggestedAction['kind'], label: string, href: string): BusinessQuerySuggestedAction => ({ kind, label, href, evidenceIds: first ? [first] : [] });
    const common = action('VIEW_REPORT', 'View reports', '/reports');
    const map: Record<BusinessQueryIntent, BusinessQuerySuggestedAction[]> = {
      SALES_ANALYSIS: [common, action('VIEW_PRODUCT', 'Review products', '/products')],
      REFUND_ANALYSIS: [common, action('VIEW_REPORT', 'Review refund report', '/reports')],
      PRODUCT_ANALYSIS: [action('VIEW_PRODUCT', 'Review products', '/products'), action('CREATE_CAMPAIGN_DRAFT', 'Review AI campaign recommendations', '/ai-daily')],
      CUSTOMER_ANALYSIS: [action('VIEW_CUSTOMER', 'Review customers', '/customers'), action('CREATE_CAMPAIGN_DRAFT', 'Review reactivation draft ideas', '/ai-daily')],
      CAMPAIGN_ANALYSIS: [action('VIEW_CAMPAIGNS', 'Review campaigns', '/campaigns'), common],
      KITCHEN_ANALYSIS: [action('VIEW_KITCHEN', 'Review kitchen', '/kitchen')],
      TABLE_ANALYSIS: [action('VIEW_TABLES', 'Review tables', '/tables')],
      APPROVAL_ANALYSIS: [action('VIEW_REPORT', 'Review approval-related reports', '/reports')],
      GENERAL_BUSINESS_SUMMARY: [common, action('VIEW_KITCHEN', 'Review kitchen', '/kitchen'), action('VIEW_CAMPAIGNS', 'Review campaigns', '/campaigns')],
      UNSUPPORTED: [common],
    };
    return map[intent].slice(0, 3);
  }
}

function ids(evidence: BusinessQueryEvidence[], preferred: string[]) {
  const existing = new Set(evidence.map((item) => item.id));
  const result = preferred.filter((id) => existing.has(id));
  if (result.length > 0) return result;
  return evidence[0] ? [evidence[0].id] : [];
}

function ensureDetails(answer: BusinessQueryAnswer, evidence: BusinessQueryEvidence[]) {
  const fallbackId = evidence[0]?.id;
  return {
    ...answer,
    details: answer.details.map((detail) => ({ ...detail, evidenceIds: detail.evidenceIds.length > 0 ? detail.evidenceIds : fallbackId ? [fallbackId] : [] })).filter((detail) => detail.evidenceIds.length > 0),
  };
}
