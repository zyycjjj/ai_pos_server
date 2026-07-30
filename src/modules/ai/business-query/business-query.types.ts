import type { BusinessDailyPreset, BusinessDailyRange } from '../business-daily/business-daily.types';

export type BusinessQueryIntent =
  | 'SALES_ANALYSIS'
  | 'REFUND_ANALYSIS'
  | 'PRODUCT_ANALYSIS'
  | 'CUSTOMER_ANALYSIS'
  | 'CAMPAIGN_ANALYSIS'
  | 'KITCHEN_ANALYSIS'
  | 'TABLE_ANALYSIS'
  | 'APPROVAL_ANALYSIS'
  | 'GENERAL_BUSINESS_SUMMARY'
  | 'UNSUPPORTED';

export type BusinessQuerySuggestedActionKind =
  | 'VIEW_REPORT'
  | 'VIEW_PRODUCT'
  | 'VIEW_CUSTOMER'
  | 'VIEW_CAMPAIGNS'
  | 'CREATE_CAMPAIGN_DRAFT'
  | 'VIEW_KITCHEN'
  | 'VIEW_TABLES';

export type BusinessQueryDtoShape = {
  question: string;
  preset?: BusinessDailyPreset;
  from?: string | null;
  to?: string | null;
  timezone?: string;
};

export type BusinessQueryEvidenceType = 'TREND' | 'METRIC' | 'ORDER' | 'PRODUCT' | 'CUSTOMER' | 'CAMPAIGN' | 'KITCHEN' | 'TABLE' | 'REFUND' | 'DISCOUNT' | 'APPROVAL' | 'SHIFT' | 'SALES' | 'SCORE';

export type BusinessQueryEvidence = {
  id: string;
  type: BusinessQueryEvidenceType;
  title: string;
  value?: number | string | null;
  refId?: string | null;
  detail?: Record<string, unknown>;
  source?: Record<string, unknown>;
};

export type BusinessQueryDetail = {
  title: string;
  text: string;
  evidenceIds: string[];
};

export type BusinessQueryAnswer = {
  headline: string;
  summary: string;
  details: BusinessQueryDetail[];
  limitations: string[];
};

export type BusinessQuerySuggestedAction = {
  kind: BusinessQuerySuggestedActionKind;
  label: string;
  href?: string;
  evidenceIds?: string[];
};

export type BusinessQueryResponse = {
  question: string;
  intent: BusinessQueryIntent;
  range: Omit<BusinessDailyRange, 'start' | 'end'>;
  answer: BusinessQueryAnswer;
  evidence: BusinessQueryEvidence[];
  suggestedActions: BusinessQuerySuggestedAction[];
  fallback: boolean;
  generatedAt: string;
};

export type BusinessQueryHistoryItem = {
  id: string;
  question: string;
  intent: BusinessQueryIntent;
  headline: string;
  createdAt: string;
};
