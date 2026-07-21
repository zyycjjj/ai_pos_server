import type { ReportRange } from './report-range';

export type ReportEnvelope<T> = {
  range: Omit<ReportRange, 'start' | 'end'>;
  currency: string;
} & T;

export type ReportsSummary = ReportEnvelope<{
  sales: {
    grossSales: number;
    netSales: number;
    refundTotal: number;
    discountTotal: number;
    promotionDiscountTotal: number;
    manualDiscountTotal: number;
    orderCount: number;
    averageOrderValue: number;
  };
  customers: {
    customerCount: number;
    newCustomers: number;
    repeatCustomers: number;
    repeatPurchaseRate: number;
  };
  campaigns: {
    campaignUsageCount: number;
    campaignDiscountTotal: number;
    customerCampaignUsageCount: number;
    customerCampaignDiscountTotal: number;
  };
  shifts: {
    closedShiftCount: number;
    cashExpectedTotal: number;
    cashActualTotal: number;
    cashVarianceTotal: number;
  };
}>;

export type ProductReportItem = {
  productId: string;
  name: string;
  quantitySold: number;
  grossSales: number;
  netSales: number;
  refundQuantity: number;
  refundAmount: number;
};

export type CustomerReportItem = {
  customerId: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
  netSales: number;
  pointsEarned: number;
  pointsAdjusted: number;
  lastOrderAt: string | null;
};

export type CampaignReportItem = {
  campaignId: string;
  name: string;
  type: string;
  customerEligibilityMode: string;
  targetSegmentName: string | null;
  usageCount: number;
  discountTotal: number;
  orderCount: number;
};

export type PaymentReportItem = {
  method: string;
  orderCount: number;
  paymentAmount: number;
  refundAmount: number;
  netAmount: number;
};

export type ShiftReportItem = {
  shiftId: string;
  openedAt: string;
  closedAt: string | null;
  openedBy: string | null;
  closedBy: string | null;
  cashExpected: number;
  cashActual: number | null;
  cashVariance: number | null;
  cashIn: number;
  cashOut: number;
  cashSales: number;
  cashRefunds: number;
};

export type ItemsReport<T> = ReportEnvelope<{ items: T[] }>;
