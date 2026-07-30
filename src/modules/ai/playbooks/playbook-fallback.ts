import { Injectable } from '@nestjs/common';

import type { BusinessDailyReport } from '../business-daily/business-daily.types';
import type { AiPlaybookDefinition, AiPlaybookEvidence, AiPlaybookFinding, AiPlaybookRecommendedAction, AiPlaybookResult, AiPlaybookStep, AiPlaybookStepStatus, AiPlaybookSummaryStatus } from './playbooks.types';

@Injectable()
export class PlaybookFallback {
  generate(input: {
    runId: string;
    definition: AiPlaybookDefinition;
    current: BusinessDailyReport;
    previous: BusinessDailyReport;
    evidence: AiPlaybookEvidence[];
  }): AiPlaybookResult {
    const status = summaryStatus(input.definition.type, input.current, input.previous);
    const evidenceIds = new Set(input.evidence.map((item) => item.id));
    const steps = input.definition.steps.map((step): AiPlaybookStep => {
      const ids = step.evidenceKeys.flatMap((key) => input.evidence.filter((item) => item.id.includes(key)).map((item) => item.id)).filter((id) => evidenceIds.has(id));
      const safeIds = ids.length > 0 ? ids.slice(0, 4) : input.evidence.slice(0, 1).map((item) => item.id);
      return {
        id: step.id,
        title: step.title,
        status: safeIds.length === 0 ? 'DATA_INSUFFICIENT' : stepStatus(input.definition.type, step.id, input.current, input.previous),
        finding: stepFinding(input.definition.type, step.id, input.current, input.previous),
        evidenceIds: safeIds,
      };
    });
    const findings = buildFindings(input.definition, input.current, input.previous, input.evidence);
    const risks = buildRisks(input.definition, input.current, input.previous, input.evidence);
    return {
      runId: input.runId,
      type: input.definition.type,
      title: input.definition.title,
      range: input.current.range,
      summary: { headline: summaryHeadline(input.definition.type, status, input.current, input.previous), status },
      steps,
      findings,
      risks,
      recommendedActions: actions(input.definition, input.evidence, input.current),
      evidence: input.evidence,
      fallback: true,
      generatedAt: new Date().toISOString(),
    };
  }
}

function summaryStatus(type: AiPlaybookDefinition['type'], current: BusinessDailyReport, previous: BusinessDailyReport): AiPlaybookSummaryStatus {
  if (current.metrics.sales.orderCount === 0 && !['LOW_SELLING_PRODUCT_PROMO', 'DORMANT_CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_RETENTION'].includes(type)) return 'DATA_INSUFFICIENT';
  if (type === 'REFUND_SPIKE_DIAGNOSIS' && current.metrics.refundApproval.refundCount > 0) return current.metrics.sales.refundTotal > previous.metrics.sales.refundTotal ? 'RISK' : 'ATTENTION';
  if (type === 'SALES_DROP_DIAGNOSIS' && current.metrics.sales.netSales < previous.metrics.sales.netSales) return 'RISK';
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS' && current.metrics.kitchen.overdueTicketCount > 0) return 'RISK';
  if (type === 'DORMANT_CUSTOMER_REACTIVATION' && current.metrics.customer.dormantCustomers.length === 0) return 'DATA_INSUFFICIENT';
  if (type === 'LOW_SELLING_PRODUCT_PROMO' && current.metrics.product.lowSellingProducts.length === 0) return 'DATA_INSUFFICIENT';
  if (type === 'TOP_CUSTOMER_RETENTION' && current.metrics.customer.topCustomers.length === 0) return 'DATA_INSUFFICIENT';
  return 'GOOD';
}

function stepStatus(type: AiPlaybookDefinition['type'], stepId: string, current: BusinessDailyReport, previous: BusinessDailyReport): AiPlaybookStepStatus {
  if (stepId.includes('draft-campaign')) return campaignEligible(type, current) ? 'ATTENTION' : 'DATA_INSUFFICIENT';
  if (type === 'REFUND_SPIKE_DIAGNOSIS') return current.metrics.refundApproval.refundCount > 0 ? 'ATTENTION' : 'PASS';
  if (type === 'SALES_DROP_DIAGNOSIS') return current.metrics.sales.netSales < previous.metrics.sales.netSales ? 'RISK' : 'PASS';
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return current.metrics.kitchen.overdueTicketCount > 0 ? 'RISK' : 'PASS';
  if (type === 'DORMANT_CUSTOMER_REACTIVATION') return current.metrics.customer.dormantCustomers.length > 0 ? 'ATTENTION' : 'DATA_INSUFFICIENT';
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return current.metrics.product.lowSellingProducts.length > 0 ? 'ATTENTION' : 'DATA_INSUFFICIENT';
  if (type === 'TOP_CUSTOMER_RETENTION') return current.metrics.customer.topCustomers.length > 0 ? 'ATTENTION' : 'DATA_INSUFFICIENT';
  return 'PASS';
}

function stepFinding(type: AiPlaybookDefinition['type'], stepId: string, current: BusinessDailyReport, previous: BusinessDailyReport) {
  if (type === 'REFUND_SPIKE_DIAGNOSIS') return `Refunds are ${current.metrics.sales.refundTotal.toFixed(2)} across ${current.metrics.refundApproval.refundCount} refund(s); previous period was ${previous.metrics.sales.refundTotal.toFixed(2)}.`;
  if (type === 'SALES_DROP_DIAGNOSIS') return `Net sales are ${current.metrics.sales.netSales.toFixed(2)} from ${current.metrics.sales.orderCount} orders; previous period was ${previous.metrics.sales.netSales.toFixed(2)}.`;
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return `${current.metrics.kitchen.overdueTicketCount} overdue ticket(s), ${current.metrics.kitchen.urgentTicketCount} urgent ticket(s), average wait ${current.metrics.kitchen.averageWaitMinutes} minutes.`;
  if (type === 'DORMANT_CUSTOMER_REACTIVATION') return `${current.metrics.customer.dormantCustomers.length} dormant customer(s) found. Review offer before activating any campaign.`;
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return `${current.metrics.product.lowSellingProducts.length} low-selling product candidate(s) found; first candidate is ${current.metrics.product.lowSellingProducts[0]?.name ?? 'not available'}.`;
  if (type === 'TOP_CUSTOMER_RETENTION') return `${current.metrics.customer.topCustomers.length} high-value customer candidate(s) found; top customer spend is ${(current.metrics.customer.topCustomers[0]?.totalSpend ?? 0).toFixed(2)}.`;
  return stepId;
}

function summaryHeadline(type: AiPlaybookDefinition['type'], status: AiPlaybookSummaryStatus, current: BusinessDailyReport, previous: BusinessDailyReport) {
  if (status === 'DATA_INSUFFICIENT') return '当前数据不足，建议先积累更多订单或顾客数据后再运行。';
  if (type === 'REFUND_SPIKE_DIAGNOSIS') return `退款 ${current.metrics.sales.refundTotal.toFixed(2)}，共 ${current.metrics.refundApproval.refundCount} 笔，建议复核退款订单和审批。`;
  if (type === 'SALES_DROP_DIAGNOSIS') return `营业额 ${current.metrics.sales.netSales.toFixed(2)}，上一周期 ${previous.metrics.sales.netSales.toFixed(2)}，建议拆解订单数和商品结构。`;
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return `后厨超时 ${current.metrics.kitchen.overdueTicketCount} 票，建议查看档口 SLA 和加急票。`;
  if (type === 'DORMANT_CUSTOMER_REACTIVATION') return `发现 ${current.metrics.customer.dormantCustomers.length} 个沉睡顾客，可准备召回活动草稿。`;
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return `发现 ${current.metrics.product.lowSellingProducts.length} 个滞销商品候选，可准备轻量促销。`;
  return `发现 ${current.metrics.customer.topCustomers.length} 个高价值顾客候选，可准备维护活动。`;
}

function buildFindings(definition: AiPlaybookDefinition, current: BusinessDailyReport, previous: BusinessDailyReport, evidence: AiPlaybookEvidence[]): AiPlaybookFinding[] {
  const first = firstEvidence(evidence);
  return [
    { title: definition.title, text: stepFinding(definition.type, 'summary', current, previous), evidenceIds: first },
    { title: 'Range', text: `Current range ${current.range.from} to ${current.range.to}; previous comparison uses matching duration.`, evidenceIds: first },
  ];
}

function buildRisks(definition: AiPlaybookDefinition, current: BusinessDailyReport, previous: BusinessDailyReport, evidence: AiPlaybookEvidence[]): AiPlaybookFinding[] {
  const ids = firstEvidence(evidence);
  const status = summaryStatus(definition.type, current, previous);
  if (status === 'GOOD') return [{ title: 'No critical risk', text: 'No high-risk signal was detected from the available evidence.', evidenceIds: ids }];
  if (status === 'DATA_INSUFFICIENT') return [{ title: 'Data insufficient', text: 'The playbook cannot make a strong recommendation without more evidence.', evidenceIds: ids }];
  return [{ title: 'Manager review needed', text: 'This playbook found an attention or risk signal that should be reviewed before taking action.', evidenceIds: ids }];
}

function actions(definition: AiPlaybookDefinition, evidence: AiPlaybookEvidence[], current: BusinessDailyReport): AiPlaybookRecommendedAction[] {
  const ids = firstEvidence(evidence);
  const rows: AiPlaybookRecommendedAction[] = [
    { kind: 'VIEW_REPORT', label: 'Review report', priority: 'MEDIUM', actionType: 'VIEW_REPORT', targetType: 'REPORT', targetUrl: '/reports', evidenceIds: ids },
    { kind: 'SAVE_ACTION', label: `Save follow-up: ${definition.title}`, priority: priorityFor(definition.type), actionType: actionTypeFor(definition.type), targetType: targetTypeFor(definition.type), targetUrl: targetUrlFor(definition.type), evidenceIds: ids },
  ];
  if (definition.campaignDraftEnabled && campaignEligible(definition.type, current)) {
    rows.push({
      kind: 'CREATE_CAMPAIGN_DRAFT',
      label: 'Create campaign draft',
      priority: 'HIGH',
      actionType: 'CREATE_CAMPAIGN_DRAFT',
      targetType: 'AI_RECOMMENDATION',
      targetUrl: '/campaigns',
      evidenceIds: ids,
      payload: { draftPayload: draftPayloadFor(definition.type, current) },
    });
  }
  return rows;
}

function firstEvidence(evidence: AiPlaybookEvidence[]) {
  return evidence.slice(0, 3).map((item) => item.id);
}

function priorityFor(type: AiPlaybookDefinition['type']) {
  return type === 'REFUND_SPIKE_DIAGNOSIS' || type === 'KITCHEN_OVERDUE_DIAGNOSIS' ? 'HIGH' : 'MEDIUM';
}

function actionTypeFor(type: AiPlaybookDefinition['type']): AiPlaybookRecommendedAction['actionType'] {
  if (type === 'REFUND_SPIKE_DIAGNOSIS') return 'REVIEW_REFUND';
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return 'REVIEW_KITCHEN_OVERDUE';
  if (type === 'DORMANT_CUSTOMER_REACTIVATION' || type === 'TOP_CUSTOMER_RETENTION') return 'REVIEW_CUSTOMER_REACTIVATION';
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return 'VIEW_PRODUCT';
  return 'VIEW_REPORT';
}

function targetTypeFor(type: AiPlaybookDefinition['type']): AiPlaybookRecommendedAction['targetType'] {
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return 'KITCHEN_STATION';
  if (type === 'DORMANT_CUSTOMER_REACTIVATION' || type === 'TOP_CUSTOMER_RETENTION') return 'CUSTOMER';
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return 'PRODUCT';
  return 'REPORT';
}

function targetUrlFor(type: AiPlaybookDefinition['type']) {
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return '/kitchen';
  if (type === 'DORMANT_CUSTOMER_REACTIVATION' || type === 'TOP_CUSTOMER_RETENTION') return '/customers';
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return '/products';
  return '/reports';
}

function campaignEligible(type: AiPlaybookDefinition['type'], current: BusinessDailyReport) {
  if (type === 'DORMANT_CUSTOMER_REACTIVATION') return current.metrics.customer.dormantCustomers.length > 0 || current.metrics.customer.topCustomers.length > 0;
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return current.metrics.product.lowSellingProducts.length > 0;
  if (type === 'TOP_CUSTOMER_RETENTION') return current.metrics.customer.topCustomers.length > 0;
  if (type === 'SALES_DROP_DIAGNOSIS') return current.metrics.sales.orderCount > 0;
  return false;
}

function draftPayloadFor(type: AiPlaybookDefinition['type'], current: BusinessDailyReport) {
  if (type === 'LOW_SELLING_PRODUCT_PROMO') {
    const product = current.metrics.product.lowSellingProducts[0];
    return { campaignType: 'ITEM_DISCOUNT', discountType: 'percentage', discountValue: 15, productId: product?.productId, suggestedDurationDays: 7, bannerCopy: `Try ${product?.name ?? 'today’s featured item'} with a manager-approved offer.`, staffMessage: 'Offer only after manager confirms the draft.' };
  }
  if (type === 'TOP_CUSTOMER_RETENTION') return { campaignType: 'PROMO_CODE', discountType: 'percentage', discountValue: 10, customerEligibilityMode: 'CUSTOMER_ONLY', promoCode: `VIP${Date.now().toString().slice(-4)}`, suggestedDurationDays: 10, bannerCopy: 'A thank-you offer for loyal guests.', staffMessage: 'Use only for manager-reviewed loyal customer outreach.' };
  if (type === 'DORMANT_CUSTOMER_REACTIVATION') return { campaignType: 'PROMO_CODE', discountType: 'percentage', discountValue: 15, customerEligibilityMode: 'CUSTOMER_ONLY', promoCode: `BACK${Date.now().toString().slice(-4)}`, suggestedDurationDays: 10, bannerCopy: 'Welcome back offer.', staffMessage: 'Manager review is required before activation.' };
  return { campaignType: 'THRESHOLD_DISCOUNT', discountType: 'fixed_amount', discountValue: 5, thresholdAmount: 50, suggestedDurationDays: 7, bannerCopy: 'Save when the basket reaches the threshold.', staffMessage: 'Use only after manager review.' };
}
