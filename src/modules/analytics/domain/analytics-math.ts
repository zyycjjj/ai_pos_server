import type { CategoryMetric, InsightSignal, MetricComparison, ProductMetric, SalesMetric } from '../analytics.types';

export const roundMetric = (value: number, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const changePercent = (current: number, previous: number) =>
  previous === 0 ? null : roundMetric(((current - previous) / previous) * 100, 1);

export const buildSalesMetric = (input: {
  grossSales: number;
  refundTotal: number;
  orderCount: number;
  unitsSold: number;
}): SalesMetric => {
  const netSales = roundMetric(input.grossSales - input.refundTotal);
  return {
    grossSales: roundMetric(input.grossSales),
    refundTotal: roundMetric(input.refundTotal),
    netSales,
    orderCount: input.orderCount,
    paidOrderCount: input.orderCount,
    averageTicket: input.orderCount === 0 ? 0 : roundMetric(netSales / input.orderCount),
    unitsSold: input.unitsSold,
  };
};

export const compareSalesMetrics = (current: SalesMetric, previous: SalesMetric): MetricComparison => ({
  grossSalesChangePercent: changePercent(current.grossSales, previous.grossSales),
  refundTotalChangePercent: changePercent(current.refundTotal, previous.refundTotal),
  netSalesChangePercent: changePercent(current.netSales, previous.netSales),
  orderCountChangePercent: changePercent(current.orderCount, previous.orderCount),
  averageTicketChangePercent: changePercent(current.averageTicket, previous.averageTicket),
  unitsSoldChangePercent: changePercent(current.unitsSold, previous.unitsSold),
  comparisonAvailable: previous.orderCount > 0 || previous.grossSales > 0 || previous.refundTotal > 0,
});

export const applyProductMetrics = (input: {
  rows: Array<Omit<ProductMetric, 'refundAmount' | 'netSales' | 'orderPenetration' | 'changePercent'>>;
  refunds: Map<string, number>;
  previousSales: Map<string, number>;
  totalOrders: number;
}) =>
  input.rows.map<ProductMetric>((row) => {
    const refundAmount = input.refunds.get(row.productId) ?? 0;
    const netSales = roundMetric(row.grossSales - refundAmount);
    return {
      ...row,
      grossSales: roundMetric(row.grossSales),
      refundAmount: roundMetric(refundAmount),
      netSales,
      orderPenetration: input.totalOrders === 0 ? 0 : roundMetric(row.orderCount / input.totalOrders, 4),
      changePercent: changePercent(netSales, input.previousSales.get(row.productId) ?? 0),
    };
  });

export const applyCategoryShares = (rows: Array<Omit<CategoryMetric, 'sharePercent' | 'changePercent'>>, previousSales: Map<string, number>) => {
  const total = rows.reduce((sum, row) => sum + row.netSales, 0);
  return rows.map<CategoryMetric>((row) => ({
    ...row,
    sharePercent: total === 0 ? 0 : roundMetric((row.netSales / total) * 100, 1),
    changePercent: changePercent(row.netSales, previousSales.get(row.name) ?? 0),
  }));
};

export const modifierAttachRate = (selectionCount: number, eligibleProductItemCount: number) =>
  eligibleProductItemCount === 0 ? 0 : roundMetric(selectionCount / eligibleProductItemCount, 4);

export const durationMinutes = (start: Date | null, end: Date | null) =>
  start && end ? roundMetric((end.getTime() - start.getTime()) / 60_000, 1) : null;

const metricSignal = (
  type: InsightSignal['type'],
  metric: string,
  currentValue: number,
  previousValue: number,
  threshold = 10,
): InsightSignal | null => {
  const change = changePercent(currentValue, previousValue);
  if (change === null || Math.abs(change) < threshold) return null;
  return { type, severity: change < 0 ? 'WARNING' : 'INFO', metric, currentValue, previousValue, changePercent: change };
};

export const buildInsightSignals = (input: {
  current: SalesMetric;
  previous: SalesMetric;
  products: ProductMetric[];
  refundRate: number;
  previousRefundRate: number;
  shifts: Array<{ staffName: string; cashVariance: number | null }>;
  kitchen: Array<{ stationName: string; avgPrepTimeMinutes: number | null }>;
}): InsightSignal[] => {
  const signals: Array<InsightSignal | null> = [
    metricSignal(input.current.netSales >= input.previous.netSales ? 'SALES_UP' : 'SALES_DOWN', 'netSales', input.current.netSales, input.previous.netSales),
    metricSignal(input.current.orderCount >= input.previous.orderCount ? 'ORDER_COUNT_UP' : 'ORDER_COUNT_DOWN', 'orderCount', input.current.orderCount, input.previous.orderCount),
    metricSignal(
      input.current.averageTicket >= input.previous.averageTicket ? 'AVERAGE_TICKET_UP' : 'AVERAGE_TICKET_DOWN',
      'averageTicket',
      input.current.averageTicket,
      input.previous.averageTicket,
    ),
  ];
  for (const product of input.products.filter((item) => item.changePercent !== null && Math.abs(item.changePercent) >= 20).slice(0, 4)) {
    signals.push({
      type: product.changePercent! >= 0 ? 'PRODUCT_SPIKE' : 'PRODUCT_DECLINE',
      severity: product.changePercent! >= 0 ? 'INFO' : 'WARNING',
      metric: 'productNetSales',
      currentValue: product.netSales,
      previousValue: null,
      changePercent: product.changePercent,
      label: product.name,
    });
  }
  const refundChange = changePercent(input.refundRate, input.previousRefundRate);
  if (refundChange !== null && refundChange >= 20) {
    signals.push({ type: 'REFUND_SPIKE', severity: 'WARNING', metric: 'refundRate', currentValue: input.refundRate, previousValue: input.previousRefundRate, changePercent: refundChange });
  }
  for (const shift of input.shifts.filter((item) => Math.abs(item.cashVariance ?? 0) >= 10).slice(0, 2)) {
    signals.push({ type: 'CASH_VARIANCE_WARNING', severity: 'WARNING', metric: 'cashVariance', currentValue: shift.cashVariance ?? 0, previousValue: null, changePercent: null, label: shift.staffName });
  }
  for (const station of input.kitchen.filter((item) => (item.avgPrepTimeMinutes ?? 0) >= 15).slice(0, 2)) {
    signals.push({ type: 'KITCHEN_SLOWDOWN', severity: 'WARNING', metric: 'avgPrepTimeMinutes', currentValue: station.avgPrepTimeMinutes ?? 0, previousValue: null, changePercent: null, label: station.stationName });
  }
  return signals.filter((item): item is InsightSignal => item !== null);
};
