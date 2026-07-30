import type { BusinessDailyMetrics } from '../business-daily/business-daily.types';
import type { BossTrend, HealthScore } from './boss-dashboard.types';
import { overdueRate } from './trend-comparison';

export function calculateHealthScore(metrics: BusinessDailyMetrics, trend: BossTrend): HealthScore {
  const salesScore = clamp(70 + trend.netSales.changeRate * 0.5 + trend.orderCount.changeRate * 0.2);
  const refundRate = metrics.sales.grossSales > 0 ? metrics.sales.refundTotal / metrics.sales.grossSales : 0;
  const refundScore = clamp(95 - refundRate * 250 - Math.max(0, trend.refundTotal.changeRate) * 0.2);
  const customerScore = clamp(60 + metrics.customer.repeatRate * 40 + trend.repeatCustomerCount.changeRate * 0.2);
  const kitchenScore = clamp(95 - overdueRate(metrics) * 220 - metrics.kitchen.urgentTicketCount * 4);
  const campaignScore = clamp(metrics.campaign.campaignUsageCount > 0 ? 75 + Math.min(15, metrics.campaign.campaignUsageCount) : 65);
  const tableScore = clamp(metrics.table.tableOrderCount > 0 ? 70 + Math.min(20, metrics.table.tableOrderCount) - metrics.table.cancelledTableOrderCount * 4 : 65);
  const total = clamp((salesScore * 0.28) + (refundScore * 0.18) + (customerScore * 0.16) + (kitchenScore * 0.16) + (campaignScore * 0.1) + (tableScore * 0.12));
  return {
    total,
    salesScore,
    refundScore,
    customerScore,
    kitchenScore,
    campaignScore,
    tableScore,
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
