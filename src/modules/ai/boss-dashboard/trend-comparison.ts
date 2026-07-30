import type { BusinessDailyMetrics } from '../business-daily/business-daily.types';
import type { BossTrend, TrendComparison, TrendDirection } from './boss-dashboard.types';

export function compareTrend(current: number, previous: number): TrendComparison {
  const changeAmount = money(current - previous);
  const changeRate = previous === 0 ? (current === 0 ? 0 : 100) : money((changeAmount / Math.abs(previous)) * 100);
  return {
    current: money(current),
    previous: money(previous),
    changeAmount,
    changeRate,
    direction: direction(changeAmount, current, previous),
  };
}

export function buildBossTrend(current: BusinessDailyMetrics, previous: BusinessDailyMetrics): BossTrend {
  return {
    netSales: compareTrend(current.sales.netSales, previous.sales.netSales),
    grossSales: compareTrend(current.sales.grossSales, previous.sales.grossSales),
    orderCount: compareTrend(current.sales.orderCount, previous.sales.orderCount),
    averageOrderValue: compareTrend(current.sales.averageOrderValue, previous.sales.averageOrderValue),
    refundTotal: compareTrend(current.sales.refundTotal, previous.sales.refundTotal),
    discountTotal: compareTrend(current.sales.discountTotal, previous.sales.discountTotal),
    newCustomerCount: compareTrend(current.customer.newCustomerCount, previous.customer.newCustomerCount),
    repeatCustomerCount: compareTrend(current.customer.repeatCustomerCount, previous.customer.repeatCustomerCount),
    repeatRate: compareTrend(current.customer.repeatRate, previous.customer.repeatRate),
    kitchenOverdueRate: compareTrend(overdueRate(current), overdueRate(previous)),
    urgentTicketCount: compareTrend(current.kitchen.urgentTicketCount, previous.kitchen.urgentTicketCount),
    tableOrderCount: compareTrend(current.table.tableOrderCount, previous.table.tableOrderCount),
    managerApprovalCount: compareTrend(current.refundApproval.managerApprovalCount, previous.refundApproval.managerApprovalCount),
  };
}

export function overdueRate(metrics: BusinessDailyMetrics) {
  return metrics.kitchen.ticketCount > 0 ? money(metrics.kitchen.overdueTicketCount / metrics.kitchen.ticketCount) : 0;
}

function direction(changeAmount: number, current: number, previous: number): TrendDirection {
  const tolerance = Math.max(0.01, Math.abs(previous) * 0.02);
  if (Math.abs(changeAmount) <= tolerance) return 'FLAT';
  return current > previous ? 'UP' : 'DOWN';
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}
