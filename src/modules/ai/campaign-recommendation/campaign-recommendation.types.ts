import type { CampaignType, CustomerEligibilityMode } from '@prisma/client';

import type { BusinessDailyEvidence, BusinessDailyPriority, BusinessDailyRange } from '../business-daily/business-daily.types';

export type AiCampaignRecommendationType =
  | 'CUSTOMER_REACTIVATION'
  | 'TOP_CUSTOMER_REWARD'
  | 'LOW_SELLING_PRODUCT_PROMO'
  | 'AOV_THRESHOLD_PROMO'
  | 'OFF_PEAK_PROMO'
  | 'KITCHEN_LOAD_BALANCE';

export type AiCampaignRecommendationTarget = {
  type: 'CUSTOMER_SEGMENT' | 'CUSTOMER_GROUP' | 'PRODUCT' | 'STORE' | 'KITCHEN_STATION';
  label: string;
  estimatedCustomerCount?: number;
  productId?: string;
  stationId?: string;
  segmentRule?: Record<string, number>;
};

export type AiCampaignRecommendationOffer = {
  campaignType: CampaignType;
  discountType?: 'percentage' | 'fixed_amount';
  discountValue?: number;
  threshold?: number;
  suggestedDurationDays: number;
  promoCode?: string;
  productId?: string;
  timeWindow?: string;
  requiresManualCompletion?: boolean;
};

export type AiCampaignExpectedImpact = {
  label: string;
  description: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

export type AiCampaignDraftPayload = {
  campaignType: CampaignType;
  discountType?: 'percentage' | 'fixed_amount';
  discountValue?: number;
  thresholdAmount?: number | null;
  productId?: string | null;
  promoCode?: string | null;
  customerEligibilityMode: CustomerEligibilityMode;
  segmentName?: string;
  segmentRule?: Record<string, number>;
  durationDays: number;
  timeWindow?: string | null;
  bannerCopy: string;
  staffMessage: string;
  requiresManualCompletion: boolean;
};

export type AiCampaignRecommendation = {
  id: string;
  type: AiCampaignRecommendationType;
  priority: BusinessDailyPriority;
  title: string;
  goal: string;
  reason: string;
  target: AiCampaignRecommendationTarget;
  offer: AiCampaignRecommendationOffer;
  expectedImpact: AiCampaignExpectedImpact;
  evidenceIds: string[];
  action: {
    kind: 'NONE' | 'CREATE_CAMPAIGN_DRAFT';
    label: string;
  };
  draftPayload?: AiCampaignDraftPayload;
};

export type AiCampaignRecommendationResponse = {
  range: Omit<BusinessDailyRange, 'start' | 'end'>;
  items: AiCampaignRecommendation[];
  evidence: BusinessDailyEvidence[];
  fallback: boolean;
  generatedAt: string;
};

export type AiCampaignDraftAdjustments = {
  title?: string;
  discountValue?: number;
  threshold?: number;
  durationDays?: number;
};

export type AiCampaignDraftMetadata = {
  aiGenerated: true;
  aiSource: 'ai_campaign_recommendation';
  aiRecommendationType: AiCampaignRecommendationType;
  aiRecommendationId: string;
  aiReason: string;
  aiEvidenceSnapshot: BusinessDailyEvidence[];
  aiExpectedImpact: AiCampaignExpectedImpact;
  aiTarget: AiCampaignRecommendationTarget;
  aiOffer: AiCampaignRecommendationOffer;
  aiCreatedAt: string;
  aiRequiresManualCompletion: boolean;
};
