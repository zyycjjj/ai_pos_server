import type { BusinessDailyRange } from '../business-daily/business-daily.types';
import type { BusinessQueryEvidence, BusinessQuerySuggestedActionKind } from '../business-query/business-query.types';

export type AiPlaybookType =
  | 'REFUND_SPIKE_DIAGNOSIS'
  | 'SALES_DROP_DIAGNOSIS'
  | 'KITCHEN_OVERDUE_DIAGNOSIS'
  | 'DORMANT_CUSTOMER_REACTIVATION'
  | 'LOW_SELLING_PRODUCT_PROMO'
  | 'TOP_CUSTOMER_RETENTION';

export type AiPlaybookCategory = 'RISK' | 'SALES' | 'KITCHEN' | 'CUSTOMER' | 'PRODUCT';
export type AiPlaybookSummaryStatus = 'GOOD' | 'ATTENTION' | 'RISK' | 'DATA_INSUFFICIENT';
export type AiPlaybookStepStatus = 'PASS' | 'ATTENTION' | 'RISK' | 'DATA_INSUFFICIENT';

export type AiPlaybookCard = {
  type: AiPlaybookType;
  title: string;
  description: string;
  category: AiPlaybookCategory;
  estimatedMinutes: number;
  enabled: boolean;
};

export type AiPlaybookStepDefinition = {
  id: string;
  title: string;
  evidenceKeys: string[];
};

export type AiPlaybookDefinition = AiPlaybookCard & {
  objective: string;
  steps: AiPlaybookStepDefinition[];
  actionKinds: BusinessQuerySuggestedActionKind[];
  campaignDraftEnabled: boolean;
};

export type AiPlaybookEvidence = BusinessQueryEvidence;

export type AiPlaybookStep = {
  id: string;
  title: string;
  status: AiPlaybookStepStatus;
  finding: string;
  evidenceIds: string[];
};

export type AiPlaybookFinding = {
  title: string;
  text: string;
  evidenceIds: string[];
};

export type AiPlaybookRecommendedAction = {
  kind: BusinessQuerySuggestedActionKind | 'SAVE_ACTION';
  label: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  actionType:
    | 'VIEW_REPORT'
    | 'VIEW_ORDER'
    | 'VIEW_PRODUCT'
    | 'VIEW_CUSTOMER'
    | 'VIEW_CAMPAIGN'
    | 'VIEW_KITCHEN'
    | 'CREATE_CAMPAIGN_DRAFT'
    | 'REVIEW_REFUND'
    | 'REVIEW_KITCHEN_OVERDUE'
    | 'REVIEW_CUSTOMER_REACTIVATION';
  targetType: 'REPORT' | 'ORDER' | 'PRODUCT' | 'CUSTOMER' | 'CAMPAIGN' | 'KITCHEN_STATION' | 'AI_RECOMMENDATION';
  targetUrl?: string;
  evidenceIds: string[];
  payload?: Record<string, unknown>;
};

export type AiPlaybookResult = {
  runId: string;
  type: AiPlaybookType;
  title: string;
  range: Omit<BusinessDailyRange, 'start' | 'end'>;
  summary: {
    headline: string;
    status: AiPlaybookSummaryStatus;
  };
  steps: AiPlaybookStep[];
  findings: AiPlaybookFinding[];
  risks: AiPlaybookFinding[];
  recommendedActions: AiPlaybookRecommendedAction[];
  evidence: AiPlaybookEvidence[];
  fallback: boolean;
  generatedAt: string;
};

export type AiPlaybookRunSummary = {
  id: string;
  type: AiPlaybookType;
  title: string;
  range: AiPlaybookResult['range'];
  summaryHeadline: string;
  status: AiPlaybookSummaryStatus;
  createdAt: string;
};
