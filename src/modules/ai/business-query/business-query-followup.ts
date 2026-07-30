import type { BusinessQueryIntent } from './business-query.types';

export type BusinessQueryFollowUpType =
  | 'NONE'
  | 'DETAIL_DRILLDOWN'
  | 'COMMON_PATTERN'
  | 'NEXT_ACTION'
  | 'SAVE_ACTION'
  | 'CAMPAIGN_DRAFT'
  | 'REUSE';

export type BusinessQueryFollowUpResolution = {
  isFollowUp: boolean;
  type: BusinessQueryFollowUpType;
  resolvedIntent: BusinessQueryIntent;
  usePreviousEvidence: boolean;
  expandEvidence: boolean;
};

const detailPatterns = [/具体.*(哪|几|个|笔)/i, /有哪些|列出来|给我明细|明细|which ones|details|list/i, /这些订单|这些顾客|谁处理|谁审批/i];
const patternPatterns = [/共同点|为什么|原因|why|common pattern|same/i];
const nextActionPatterns = [/怎么办|怎么处理|该怎么|下一步|处理建议|what should/i];
const saveActionPatterns = [/保存.*待办|保存成待办|记一下|加入行动项|加到行动|save.*action|to.?do/i];
const campaignDraftPatterns = [/生成.*活动草稿|活动草稿|做个.*活动|召回活动|发优惠|campaign draft|create.*campaign/i];
const reusePatterns = [/继续说|展开说|再解释|总结一下|more|explain/i];

export function resolveBusinessQueryFollowUp(input: {
  question: string;
  conversationId?: string | null;
  classifiedIntent: BusinessQueryIntent;
  previousIntent?: BusinessQueryIntent | null;
}): BusinessQueryFollowUpResolution {
  const type = detectBusinessQueryFollowUpType(input.question);
  const isFollowUp = Boolean(input.conversationId && input.previousIntent && type !== 'NONE');
  if (!isFollowUp) {
    return {
      isFollowUp: false,
      type: 'NONE',
      resolvedIntent: input.classifiedIntent,
      usePreviousEvidence: false,
      expandEvidence: false,
    };
  }

  const previousIntent = input.previousIntent ?? 'GENERAL_BUSINESS_SUMMARY';
  const resolvedIntent = resolveIntentForFollowUp(type, input.classifiedIntent, previousIntent);
  return {
    isFollowUp: true,
    type,
    resolvedIntent,
    usePreviousEvidence: ['COMMON_PATTERN', 'NEXT_ACTION', 'SAVE_ACTION', 'CAMPAIGN_DRAFT', 'REUSE'].includes(type),
    expandEvidence: type === 'DETAIL_DRILLDOWN' || /谁处理|谁审批|哪些|明细|列出来/i.test(input.question),
  };
}

export function detectBusinessQueryFollowUpType(question: string): BusinessQueryFollowUpType {
  const normalized = question.trim();
  if (campaignDraftPatterns.some((pattern) => pattern.test(normalized))) return 'CAMPAIGN_DRAFT';
  if (saveActionPatterns.some((pattern) => pattern.test(normalized))) return 'SAVE_ACTION';
  if (detailPatterns.some((pattern) => pattern.test(normalized))) return 'DETAIL_DRILLDOWN';
  if (nextActionPatterns.some((pattern) => pattern.test(normalized))) return 'NEXT_ACTION';
  if (patternPatterns.some((pattern) => pattern.test(normalized))) return 'COMMON_PATTERN';
  if (reusePatterns.some((pattern) => pattern.test(normalized))) return 'REUSE';
  return 'NONE';
}

function resolveIntentForFollowUp(type: BusinessQueryFollowUpType, classifiedIntent: BusinessQueryIntent, previousIntent: BusinessQueryIntent): BusinessQueryIntent {
  if (type === 'CAMPAIGN_DRAFT' && previousIntent === 'CUSTOMER_ANALYSIS') return 'CUSTOMER_ANALYSIS';
  if (type === 'CAMPAIGN_DRAFT' && previousIntent === 'PRODUCT_ANALYSIS') return 'PRODUCT_ANALYSIS';
  if (classifiedIntent !== 'GENERAL_BUSINESS_SUMMARY' && classifiedIntent !== 'UNSUPPORTED') return classifiedIntent;
  return previousIntent;
}
