export type AnalyticsCompare = 'previous_period' | 'previous_day' | 'previous_week';

export type AnalyticsPeriod = {
  from: string;
  to: string;
  timezone: string;
  start: Date;
  end: Date;
};

export type SalesMetric = {
  grossSales: number;
  refundTotal: number;
  netSales: number;
  orderCount: number;
  paidOrderCount: number;
  averageTicket: number;
  unitsSold: number;
};

export type MetricComparison = {
  grossSalesChangePercent: number | null;
  refundTotalChangePercent: number | null;
  netSalesChangePercent: number | null;
  orderCountChangePercent: number | null;
  averageTicketChangePercent: number | null;
  unitsSoldChangePercent: number | null;
  comparisonAvailable: boolean;
};

export type ProductMetric = {
  productId: string;
  name: string;
  category: string;
  unitsSold: number;
  orderCount: number;
  grossSales: number;
  refundAmount: number;
  netSales: number;
  orderPenetration: number;
  changePercent: number | null;
};

export type CategoryMetric = {
  categoryId: string | null;
  name: string;
  unitsSold: number;
  grossSales: number;
  refundAmount: number;
  netSales: number;
  sharePercent: number;
  changePercent: number | null;
};

export type InsightSignalType =
  | 'SALES_UP'
  | 'SALES_DOWN'
  | 'ORDER_COUNT_UP'
  | 'ORDER_COUNT_DOWN'
  | 'AVERAGE_TICKET_UP'
  | 'AVERAGE_TICKET_DOWN'
  | 'PRODUCT_SPIKE'
  | 'PRODUCT_DECLINE'
  | 'REFUND_SPIKE'
  | 'CASH_VARIANCE_WARNING'
  | 'KITCHEN_SLOWDOWN';

export type InsightSignal = {
  type: InsightSignalType;
  severity: 'INFO' | 'WARNING';
  metric: string;
  currentValue: number;
  previousValue: number | null;
  changePercent: number | null;
  label?: string;
};

export type DateBucket = {
  label: string;
  start: Date;
  end: Date;
};

