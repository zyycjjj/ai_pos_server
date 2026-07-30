import type { BusinessDailyMetrics, BusinessDailyRange } from '../business-daily/business-daily.types';

export type BossDashboardPreset = 'today' | 'yesterday' | 'last7days' | 'thisMonth';
export type TrendDirection = 'UP' | 'DOWN' | 'FLAT';
export type BossEvidenceType =
  | 'TREND'
  | 'SCORE'
  | 'SALES'
  | 'PRODUCT'
  | 'CUSTOMER'
  | 'CAMPAIGN'
  | 'KITCHEN'
  | 'TABLE'
  | 'REFUND'
  | 'APPROVAL'
  | 'SHIFT';

export type BossDashboardQuery = {
  preset?: BossDashboardPreset;
  timezone?: string;
};

export type WeeklyInsightQuery = {
  weekStart?: string;
  timezone?: string;
};

export type BossRange = Omit<BusinessDailyRange, 'preset'> & { preset: BossDashboardPreset };

export type TrendComparison = {
  current: number;
  previous: number;
  changeAmount: number;
  changeRate: number;
  direction: TrendDirection;
};

export type TrendMetricKey =
  | 'netSales'
  | 'grossSales'
  | 'orderCount'
  | 'averageOrderValue'
  | 'refundTotal'
  | 'discountTotal'
  | 'newCustomerCount'
  | 'repeatCustomerCount'
  | 'repeatRate'
  | 'kitchenOverdueRate'
  | 'urgentTicketCount'
  | 'tableOrderCount'
  | 'managerApprovalCount';

export type BossTrend = Record<TrendMetricKey, TrendComparison>;

export type HealthScore = {
  total: number;
  salesScore: number;
  refundScore: number;
  customerScore: number;
  kitchenScore: number;
  campaignScore: number;
  tableScore: number;
};

export type BossEvidence = {
  id: string;
  type: BossEvidenceType;
  title: string;
  value?: number | string | null;
  refId?: string | null;
  detail?: Record<string, unknown>;
};

export type BossSection = {
  text: string;
  evidenceIds: string[];
};

export type BossDashboardReport = {
  range: Omit<BossRange, 'start' | 'end'>;
  headline: string;
  healthScore: number;
  scoreBreakdown: HealthScore;
  trend: BossTrend;
  sections: {
    sales: BusinessDailyMetrics['sales'];
    products: BusinessDailyMetrics['product'];
    customers: BusinessDailyMetrics['customer'];
    campaigns: BusinessDailyMetrics['campaign'];
    kitchen: BusinessDailyMetrics['kitchen'] & { overdueRate: number };
    tables: BusinessDailyMetrics['table'];
    refunds: BusinessDailyMetrics['refundApproval'];
  };
  insights: BossSection[];
  risks: BossSection[];
  nextActions: BossSection[];
  evidence: BossEvidence[];
  fallback: boolean;
  generatedAt: string;
};

export type WeeklyInsightReport = {
  week: {
    start: string;
    end: string;
    timezone: string;
  };
  headline: string;
  summary: BossSection[];
  highlights: BossSection[];
  risks: BossSection[];
  trendExplanations: BossSection[];
  nextWeekActions: BossSection[];
  campaignSuggestions: BossSection[];
  evidence: BossEvidence[];
  fallback: boolean;
  generatedAt: string;
};
