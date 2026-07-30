import { Injectable } from '@nestjs/common';

import type { BusinessDailyMetrics } from '../business-daily/business-daily.types';
import { calculateHealthScore } from './health-score';
import { buildBossTrend, overdueRate } from './trend-comparison';
import type { BossDashboardReport, BossEvidence, BossEvidenceType, BossRange, BossSection, WeeklyInsightReport } from './boss-dashboard.types';

type BuildInput = {
  range: BossRange;
  current: BusinessDailyMetrics;
  previous: BusinessDailyMetrics;
  fallback: boolean;
};

@Injectable()
export class BossDashboardFallback {
  buildDashboard(input: BuildInput): BossDashboardReport {
    const evidence = new BossEvidenceBuilder();
    const trend = buildBossTrend(input.current, input.previous);
    const score = calculateHealthScore(input.current, trend);
    const salesTrendEvidence = evidence.add('TREND', 'Net sales trend', trend.netSales.changeRate, { metric: 'netSales', trend: trend.netSales });
    const scoreEvidence = evidence.add('SCORE', 'Business health score', score.total, score);
    const refundEvidence = evidence.add('REFUND', 'Refund trend', trend.refundTotal.changeRate, { metric: 'refundTotal', trend: trend.refundTotal, refundCount: input.current.refundApproval.refundCount });
    const discountEvidence = evidence.add('SALES', 'Discount trend', trend.discountTotal.changeRate, { metric: 'discountTotal', trend: trend.discountTotal });
    const customerEvidence = evidence.add('CUSTOMER', 'Customer repeat trend', trend.repeatRate.changeRate, { metric: 'repeatRate', trend: trend.repeatRate, repeatCustomerCount: input.current.customer.repeatCustomerCount });
    const kitchenEvidence = evidence.add('KITCHEN', 'Kitchen SLA trend', trend.kitchenOverdueRate.changeRate, { metric: 'kitchenOverdueRate', trend: trend.kitchenOverdueRate, overdueTicketCount: input.current.kitchen.overdueTicketCount, urgentTicketCount: input.current.kitchen.urgentTicketCount });
    const tableEvidence = evidence.add('TABLE', 'Table order trend', trend.tableOrderCount.changeRate, { metric: 'tableOrderCount', trend: trend.tableOrderCount });
    const approvalEvidence = evidence.add('APPROVAL', 'Manager approval trend', trend.managerApprovalCount.changeRate, { metric: 'managerApprovalCount', trend: trend.managerApprovalCount });
    const campaignEvidence = evidence.add('CAMPAIGN', 'Campaign activity', input.current.campaign.campaignUsageCount, { activeCampaignCount: input.current.campaign.activeCampaignCount, campaignDiscountTotal: input.current.campaign.campaignDiscountTotal });
    const productEvidence = evidence.add('PRODUCT', 'Product performance', input.current.product.topProducts[0]?.netSales ?? 0, { topProducts: input.current.product.topProducts.slice(0, 3), lowSellingProducts: input.current.product.lowSellingProducts.slice(0, 3) });

    const headline = input.current.sales.orderCount === 0
      ? 'data_insufficient: Not enough paid orders yet, but operational signals are ready for review.'
      : `${trend.netSales.direction === 'UP' ? 'Sales improved' : trend.netSales.direction === 'DOWN' ? 'Sales softened' : 'Sales stayed stable'} with a ${score.total}/100 business health score.`;

    return {
      range: { from: input.range.from, to: input.range.to, timezone: input.range.timezone, preset: input.range.preset },
      headline,
      healthScore: score.total,
      scoreBreakdown: score,
      trend,
      sections: {
        sales: input.current.sales,
        products: input.current.product,
        customers: input.current.customer,
        campaigns: input.current.campaign,
        kitchen: { ...input.current.kitchen, overdueRate: overdueRate(input.current) },
        tables: input.current.table,
        refunds: input.current.refundApproval,
      },
      insights: this.dashboardInsights(input.current, trend, { salesTrendEvidence, productEvidence, customerEvidence, campaignEvidence, tableEvidence }),
      risks: this.dashboardRisks(input.current, trend, { refundEvidence, discountEvidence, kitchenEvidence, approvalEvidence }),
      nextActions: this.dashboardActions(input.current, { salesTrendEvidence, productEvidence, customerEvidence, kitchenEvidence, campaignEvidence }),
      evidence: evidence.all(),
      fallback: input.fallback,
      generatedAt: new Date().toISOString(),
    };
  }

  buildWeekly(input: BuildInput): WeeklyInsightReport {
    const dashboard = this.buildDashboard(input);
    const evidence = dashboard.evidence;
    const salesEvidence = evidence.find((item) => item.title === 'Net sales trend')?.id ?? evidence[0].id;
    const productEvidence = evidence.find((item) => item.type === 'PRODUCT')?.id ?? salesEvidence;
    const customerEvidence = evidence.find((item) => item.type === 'CUSTOMER')?.id ?? salesEvidence;
    const campaignEvidence = evidence.find((item) => item.type === 'CAMPAIGN')?.id ?? salesEvidence;
    const kitchenEvidence = evidence.find((item) => item.type === 'KITCHEN')?.id ?? salesEvidence;
    const refundEvidence = evidence.find((item) => item.type === 'REFUND')?.id ?? salesEvidence;
    const approvalEvidence = evidence.find((item) => item.type === 'APPROVAL')?.id ?? salesEvidence;

    return {
      week: { start: input.range.from, end: input.range.to, timezone: input.range.timezone },
      headline: dashboard.headline,
      summary: [
        { text: `${input.range.from} to ${input.range.to}: net sales were ${input.current.sales.netSales.toFixed(2)} from ${input.current.sales.orderCount} paid orders.`, evidenceIds: [salesEvidence] },
        { text: `The rule-based health score is ${dashboard.healthScore}/100, with kitchen and refund signals included.`, evidenceIds: [evidence.find((item) => item.type === 'SCORE')?.id ?? salesEvidence] },
      ],
      highlights: [
        { text: input.current.product.topProducts[0] ? `${input.current.product.topProducts[0].name} led product performance this week.` : 'data_insufficient: Not enough product sales to name a product winner.', evidenceIds: [productEvidence] },
        { text: input.current.customer.repeatCustomerCount > 0 ? `${input.current.customer.repeatCustomerCount} repeat customers contributed this week.` : 'data_insufficient: Repeat customer contribution is not visible yet.', evidenceIds: [customerEvidence] },
        { text: input.current.campaign.campaignUsageCount > 0 ? `${input.current.campaign.campaignUsageCount} campaign uses were recorded.` : 'Campaign usage was limited or not recorded this week.', evidenceIds: [campaignEvidence] },
      ],
      risks: dashboard.risks,
      trendExplanations: [
        { text: `Sales trend: net sales moved ${dashboard.trend.netSales.direction.toLowerCase()} by ${dashboard.trend.netSales.changeRate}%.`, evidenceIds: [salesEvidence] },
        { text: `Kitchen trend: overdue rate moved ${dashboard.trend.kitchenOverdueRate.direction.toLowerCase()} by ${dashboard.trend.kitchenOverdueRate.changeRate}%.`, evidenceIds: [kitchenEvidence] },
        { text: `Refund and approval trend should be reviewed together before changing policy.`, evidenceIds: [refundEvidence, approvalEvidence] },
      ],
      nextWeekActions: this.dashboardActions(input.current, { salesTrendEvidence: salesEvidence, productEvidence, customerEvidence, kitchenEvidence, campaignEvidence }),
      campaignSuggestions: [
        { text: input.current.customer.dormantCustomers.length > 0 ? 'Prepare a reactivation campaign draft for dormant customers, then review it manually.' : 'Review customer segments before creating a reactivation campaign.', evidenceIds: [customerEvidence] },
        { text: input.current.product.lowSellingProducts.length > 0 ? `Consider a controlled offer for ${input.current.product.lowSellingProducts[0].name}.` : 'data_insufficient: Low-selling product campaign needs more menu movement data.', evidenceIds: [productEvidence] },
      ],
      evidence,
      fallback: input.fallback,
      generatedAt: new Date().toISOString(),
    };
  }

  private dashboardInsights(metrics: BusinessDailyMetrics, trend: BossDashboardReport['trend'], evidence: Record<string, string>): BossSection[] {
    return [
      { text: `Net sales are ${trend.netSales.direction.toLowerCase()} versus the previous comparable period.`, evidenceIds: [evidence.salesTrendEvidence] },
      { text: metrics.product.topProducts[0] ? `${metrics.product.topProducts[0].name} is the strongest product signal.` : 'data_insufficient: Product contribution needs more paid orders.', evidenceIds: [evidence.productEvidence] },
      { text: `${metrics.table.tableOrderCount} table-linked orders were included in this period.`, evidenceIds: [evidence.tableEvidence] },
    ];
  }

  private dashboardRisks(metrics: BusinessDailyMetrics, trend: BossDashboardReport['trend'], evidence: Record<string, string>): BossSection[] {
    const risks: BossSection[] = [];
    if (metrics.sales.refundTotal > 0 || trend.refundTotal.direction === 'UP') risks.push({ text: `Refunds reached ${metrics.sales.refundTotal.toFixed(2)} and changed ${trend.refundTotal.changeRate}% versus the previous period.`, evidenceIds: [evidence.refundEvidence] });
    if (metrics.sales.manualDiscountTotal > 0 || trend.discountTotal.direction === 'UP') risks.push({ text: `Discount usage changed ${trend.discountTotal.changeRate}% and manual discount total was ${metrics.sales.manualDiscountTotal.toFixed(2)}.`, evidenceIds: [evidence.discountEvidence] });
    if (metrics.kitchen.overdueTicketCount > 0 || metrics.kitchen.urgentTicketCount > 0) risks.push({ text: `${metrics.kitchen.overdueTicketCount} overdue kitchen tickets and ${metrics.kitchen.urgentTicketCount} urgent tickets need attention.`, evidenceIds: [evidence.kitchenEvidence] });
    if (metrics.refundApproval.managerApprovalCount > 0) risks.push({ text: `${metrics.refundApproval.managerApprovalCount} manager approval events occurred; review reasons for coaching or policy tuning.`, evidenceIds: [evidence.approvalEvidence] });
    return risks.length > 0 ? risks : [{ text: 'No major risk was detected from the available evidence.', evidenceIds: [evidence.approvalEvidence] }];
  }

  private dashboardActions(metrics: BusinessDailyMetrics, evidence: Record<string, string>): BossSection[] {
    const actions: BossSection[] = [
      { text: metrics.product.topProducts[0] ? `Keep staff focused on recommending ${metrics.product.topProducts[0].name}.` : 'Review the menu after more sales data is collected.', evidenceIds: [evidence.productEvidence] },
      { text: metrics.customer.dormantCustomers.length > 0 ? 'Prepare a customer reactivation draft, then let a manager review before activation.' : 'Review customer capture at checkout to improve future repeat-customer insight.', evidenceIds: [evidence.customerEvidence] },
      { text: metrics.kitchen.overdueTicketCount > 0 ? 'Check the station with the most overdue tickets and adjust routing or prep capacity.' : 'Keep monitoring kitchen SLA before changing station routing.', evidenceIds: [evidence.kitchenEvidence] },
    ];
    if (metrics.campaign.campaignUsageCount === 0) actions.push({ text: 'Create only a DRAFT campaign from AI recommendations and review it manually before activation.', evidenceIds: [evidence.campaignEvidence] });
    return actions.slice(0, 4);
  }
}

class BossEvidenceBuilder {
  private readonly items: BossEvidence[] = [];
  private index = 1;

  add(type: BossEvidenceType, title: string, value?: number | string | null, detail?: Record<string, unknown>, refId?: string | null) {
    const item = {
      id: `boss_ev_${String(this.index++).padStart(3, '0')}`,
      type,
      title,
      value,
      refId,
      detail,
    };
    this.items.push(item);
    return item.id;
  }

  all() {
    return this.items;
  }
}
