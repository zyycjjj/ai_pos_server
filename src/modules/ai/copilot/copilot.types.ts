import type { AnalyticsQueryDto } from '@/modules/analytics/dto/analytics-query.dto';

export type CopilotContextType =
  | 'GENERAL'
  | 'SALES'
  | 'PRODUCT'
  | 'CATEGORY'
  | 'MODIFIER'
  | 'REFUND'
  | 'SHIFT'
  | 'KITCHEN'
  | 'PAYMENT'
  | 'UNKNOWN';

export type CopilotPeriodInput = Partial<Pick<AnalyticsQueryDto, 'preset' | 'from' | 'to' | 'compare'>>;

export type CopilotEvidence = {
  label: string;
  value: number | string | null;
  comparisonValue?: number | string | null;
  changePercent?: number | null;
};

export type CopilotRecommendation = {
  title: string;
  description: string;
};

export type CopilotStructuredResponse = {
  answer: string;
  summary: string;
  evidence: CopilotEvidence[];
  drivers: Array<{ type: string; text: string }>;
  risks: Array<{ severity: 'INFO' | 'WARNING'; text: string }>;
  recommendations: CopilotRecommendation[];
  limitations: string[];
};

export type CopilotChatResponse = CopilotStructuredResponse & {
  conversationId: string;
  messageId: string;
  executionId: string;
  provider: string;
  model: string;
  source: 'deepseek' | 'fallback';
  contextType: CopilotContextType;
  period: { from: string; to: string; timezone: string };
  comparisonPeriod: { from: string; to: string; timezone: string };
  dataCoverage: Record<string, boolean>;
  suggestedQuestions: string[];
};
