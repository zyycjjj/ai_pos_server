export type AiCampaignSalesSummary = {
  totalOrders: number;
  totalRevenue: number;
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  lowPerformingProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  paymentBreakdown: Array<{
    method: string;
    amount: number;
  }>;
};

export type AiGeneratedCampaign = {
  campaignName: string;
  goal: string;
  targetProducts: string[];
  discountType: 'percentage' | 'fixed_amount' | 'bundle' | 'staff_prompt';
  discountValue: number;
  timeWindow: string;
  bannerCopy: string;
  staffMessage: string;
  executionNotes: string[];
  salesSummary: AiCampaignSalesSummary;
  provider: 'deepseek' | 'mock';
  model: string;
};
