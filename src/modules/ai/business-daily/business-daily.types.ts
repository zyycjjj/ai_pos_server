export type BusinessDailyPreset = 'today' | 'yesterday' | 'last7days' | 'custom';

export type BusinessDailyEvidenceType =
  | 'METRIC'
  | 'ORDER'
  | 'PRODUCT'
  | 'CUSTOMER'
  | 'CAMPAIGN'
  | 'KITCHEN'
  | 'REFUND'
  | 'DISCOUNT'
  | 'TABLE'
  | 'SHIFT'
  | 'APPROVAL';

export type BusinessDailyRecommendationType =
  | 'SALES'
  | 'PRODUCT'
  | 'CUSTOMER'
  | 'CAMPAIGN'
  | 'KITCHEN'
  | 'REFUND'
  | 'DISCOUNT'
  | 'TABLE';

export type BusinessDailyPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type BusinessDailyRange = {
  from: string;
  to: string;
  timezone: string;
  preset: BusinessDailyPreset;
  start: Date;
  end: Date;
};

export type BusinessDailyEvidence = {
  id: string;
  type: BusinessDailyEvidenceType;
  title: string;
  value?: number | string | null;
  refId?: string | null;
  detail?: Record<string, unknown>;
};

export type BusinessDailyRecommendation = {
  id: string;
  type: BusinessDailyRecommendationType;
  priority: BusinessDailyPriority;
  title: string;
  reason: string;
  evidenceIds: string[];
  action: {
    kind: 'NONE' | 'CREATE_CAMPAIGN_DRAFT';
    label: string;
    campaignTemplate?: BusinessDailyCampaignTemplate;
  };
};

export type BusinessDailyCampaignTemplate =
  | 'CUSTOMER_REACTIVATION'
  | 'TOP_CUSTOMER_REWARD'
  | 'LOW_SELLING_PRODUCT_PROMO'
  | 'THRESHOLD_DISCOUNT'
  | 'LUNCH_TIME_PROMO';

export type BusinessDailySection = {
  text: string;
  evidenceIds: string[];
};

export type BusinessDailyReport = {
  range: Omit<BusinessDailyRange, 'start' | 'end'>;
  summary: BusinessDailySection;
  highlights: BusinessDailySection[];
  risks: BusinessDailySection[];
  metrics: BusinessDailyMetrics;
  evidence: BusinessDailyEvidence[];
  recommendations: BusinessDailyRecommendation[];
  generatedBy: string;
  fallback: boolean;
  generatedAt: string;
};

export type BusinessDailyMetrics = {
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
  product: {
    topProducts: Array<{ productId: string; name: string; quantitySold: number; netSales: number }>;
    lowSellingProducts: Array<{ productId: string; name: string; quantitySold: number; netSales: number }>;
    soldOutProducts: Array<{ productId: string; name: string }>;
    inactiveProducts: Array<{ productId: string; name: string }>;
    productsWithHighModifierUsage: Array<{ productId: string; name: string; modifierUsageCount: number }>;
  };
  customer: {
    newCustomerCount: number;
    repeatCustomerCount: number;
    repeatRate: number;
    topCustomers: Array<{ customerId: string; name: string | null; phone: string; totalSpend: number; orderCount: number }>;
    dormantCustomers: Array<{ customerId: string; name: string | null; phone: string; lastOrderAt: string | null }>;
    loyaltyPointsIssued: number;
  };
  campaign: {
    activeCampaignCount: number;
    campaignUsageCount: number;
    campaignDiscountTotal: number;
    topCampaigns: Array<{ campaignId: string; name: string; usageCount: number; discountTotal: number }>;
    campaignsNearUsageLimit: Array<{ campaignId: string; name: string; usageCount: number; usageLimit: number }>;
  };
  kitchen: {
    ticketCount: number;
    readyTicketCount: number;
    cancelledTicketCount: number;
    overdueTicketCount: number;
    averageWaitMinutes: number;
    averageCookMinutes: number;
    topOverdueStations: Array<{ stationId: string; name: string; overdueTicketCount: number }>;
    urgentTicketCount: number;
  };
  table: {
    dineInOrderCount: number;
    tableOrderCount: number;
    averageTableDuration: number;
    topTablesBySales: Array<{ tableId: string; name: string; sales: number; orderCount: number }>;
    cancelledTableOrderCount: number;
  };
  refundApproval: {
    refundCount: number;
    refundTotal: number;
    managerApprovalCount: number;
    voidCount: number;
    cashOutCount: number;
    manualDiscountApprovalCount: number;
  };
};
