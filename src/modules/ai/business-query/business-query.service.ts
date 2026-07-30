import { Injectable } from '@nestjs/common';
import { AiActionPriority, AiActionSourceType, AiActionTargetType, AiActionType, CampaignType, CustomerEligibilityMode } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { DeepSeekProvider } from '@/modules/ai/providers/deepseek.provider';

import { AiActionsService } from '../actions/ai-actions.service';
import { BossDashboardFallback } from '../boss-dashboard/boss-dashboard-fallback';
import type { BossDashboardReport } from '../boss-dashboard/boss-dashboard.types';
import { BusinessDailyFallback } from '../business-daily/business-daily-fallback';
import { BusinessDailyRepository } from '../business-daily/business-daily.repository';
import { resolveBusinessDailyRange } from '../business-daily/business-daily.service';
import type { BusinessDailyRange } from '../business-daily/business-daily.types';
import type { BusinessDailyQueryDto } from '../business-daily/dto/business-daily.dto';
import { buildBusinessQueryEvidence } from './business-query-evidence';
import { BusinessQueryFallback } from './business-query-fallback';
import { BusinessQueryConversationRepository } from './business-query-conversation.repository';
import { BusinessQueryDrilldown } from './business-query-drilldown';
import { resolveBusinessQueryFollowUp, type BusinessQueryFollowUpType } from './business-query-followup';
import { classifyBusinessQueryIntent } from './business-query-intent';
import { buildBusinessQueryPrompt } from './business-query-prompt';
import type { BusinessQueryAnswer, BusinessQueryDetail, BusinessQueryDtoShape, BusinessQueryEvidence, BusinessQueryIntent, BusinessQueryResponse } from './business-query.types';

@Injectable()
export class BusinessQueryService {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly repository: BusinessDailyRepository,
    private readonly dailyFallback: BusinessDailyFallback,
    private readonly bossFallback: BossDashboardFallback,
    private readonly fallback: BusinessQueryFallback,
    private readonly conversations: BusinessQueryConversationRepository,
    private readonly drilldown: BusinessQueryDrilldown,
    private readonly actions: AiActionsService,
    private readonly deepSeek: DeepSeekProvider,
  ) {}

  async ask(dto: BusinessQueryDtoShape, currentUser: AuthRequestUser): Promise<BusinessQueryResponse> {
    const question = dto.question.trim();
    const storeId = this.storeContext.getStoreId();
    const classifiedIntent = classifyBusinessQueryIntent(question);
    const context = await this.conversations.getContext(storeId, dto.conversationId);
    const followUp = resolveBusinessQueryFollowUp({ question, conversationId: dto.conversationId, classifiedIntent, previousIntent: context?.previousIntent });
    const intent = followUp.resolvedIntent;
    const dailyQuery = normalizeDailyQuery(dto, context?.previousRange && followUp.isFollowUp ? context.previousRange : undefined);
    const range = resolveBusinessDailyRange(dailyQuery);
    const dailyRaw = await this.repository.load(storeId, range);
    const daily = this.dailyFallback.generate(range, dailyRaw, { generatedBy: 'business-query-baseline', providerLabel: 'fallback', fallback: true });
    const boss = await this.tryBossDashboard(range);
    const baseEvidence = buildBusinessQueryEvidence(intent, daily, boss);
    const expandedEvidence = followUp.expandEvidence ? await this.drilldown.expand({ storeId, intent, range }) : [];
    const evidence = mergeEvidence([
      ...(followUp.usePreviousEvidence ? context?.previousEvidence ?? [] : []),
      ...expandedEvidence,
      ...baseEvidence,
    ]);

    let baseline: BusinessQueryResponse = {
      conversationId: context?.conversationId ?? '',
      messageId: '',
      question,
      intent,
      resolvedIntent: intent,
      isFollowUp: followUp.isFollowUp,
      contextUsed: {
        previousIntent: context?.previousIntent ?? null,
        previousRange: context?.previousRange ?? null,
        usedPreviousEvidence: followUp.usePreviousEvidence,
        expandedEvidence: expandedEvidence.length > 0,
      },
      range: daily.range,
      answer: this.answerFor({ question, intent, followUpType: followUp.type, daily, evidence, previousHeadline: context?.previousAnswerHeadline }),
      evidence,
      suggestedActions: this.suggestedActionsFor(intent, followUp.type, evidence),
      fallback: true,
      generatedAt: new Date().toISOString(),
    };

    baseline = await this.applyFollowUpSideEffect(baseline, currentUser, followUp.type);
    const response = await this.tryProviderAnswer(baseline);
    const ids = await this.conversations.record({ storeId, userId: currentUser.id, conversationId: dto.conversationId, response });
    return { ...response, conversationId: ids.conversationId, messageId: ids.messageId };
  }

  conversationsFor() {
    return this.conversations.listConversations(this.storeContext.getStoreId());
  }

  conversationDetail(id: string) {
    return this.conversations.getConversation(this.storeContext.getStoreId(), id);
  }

  historyFor(currentUser: AuthRequestUser) {
    return this.conversations.listHistory(this.storeContext.getStoreId(), currentUser.id);
  }

  private answerFor(input: { question: string; intent: BusinessQueryIntent; followUpType: BusinessQueryFollowUpType; daily: ReturnType<BusinessDailyFallback['generate']>; evidence: BusinessQueryEvidence[]; previousHeadline?: string | null }): BusinessQueryAnswer {
    if (input.followUpType === 'DETAIL_DRILLDOWN') return drilldownAnswer(input.evidence, input.previousHeadline);
    if (input.followUpType === 'COMMON_PATTERN') return commonPatternAnswer(input.evidence, input.previousHeadline);
    if (input.followUpType === 'NEXT_ACTION') return nextActionAnswer(input.intent, input.evidence);
    if (input.followUpType === 'SAVE_ACTION') return sideEffectPendingAnswer('I can save this as an AI Action item.', input.evidence);
    if (input.followUpType === 'CAMPAIGN_DRAFT') return sideEffectPendingAnswer('I can create a campaign draft from this context if the evidence is sufficient.', input.evidence);
    return this.fallback.answer({ question: input.question, intent: input.intent, daily: input.daily, evidence: input.evidence });
  }

  private suggestedActionsFor(intent: BusinessQueryIntent, followUpType: BusinessQueryFollowUpType, evidence: BusinessQueryEvidence[]) {
    if (followUpType === 'CAMPAIGN_DRAFT') return [{ kind: 'CREATE_CAMPAIGN_DRAFT' as const, label: 'Review campaign draft', href: '/campaigns', evidenceIds: firstEvidenceIds(evidence) }];
    if (followUpType === 'SAVE_ACTION') return [{ kind: 'VIEW_REPORT' as const, label: 'Open AI Actions', href: '/ai-actions', evidenceIds: firstEvidenceIds(evidence) }];
    return this.fallback.suggestedActions(intent, evidence);
  }

  private async applyFollowUpSideEffect(response: BusinessQueryResponse, currentUser: AuthRequestUser, followUpType: BusinessQueryFollowUpType): Promise<BusinessQueryResponse> {
    if (followUpType === 'SAVE_ACTION') {
      const actionType = actionTypeForIntent(response.intent);
      const action = await this.actions.create({
        sourceType: AiActionSourceType.AI_ASK,
        sourceId: response.conversationId || undefined,
        sourceTitle: response.question,
        actionType,
        priority: priorityForIntent(response.intent),
        title: response.answer.headline.slice(0, 140),
        description: response.answer.summary,
        reason: response.contextUsed.previousIntent ? `Follow-up from ${response.contextUsed.previousIntent}` : response.intent,
        targetType: targetTypeForAction(actionType),
        targetUrl: targetUrlForAction(actionType),
        payload: { question: response.question, intent: response.intent, range: response.range, conversationId: response.conversationId },
        evidenceSnapshot: response.evidence.slice(0, 8),
      }, currentUser);
      return {
        ...response,
        contextUsed: { ...response.contextUsed, actionCreated: true },
        answer: {
          headline: 'Saved to AI Actions.',
          summary: `I saved this follow-up as an OPEN AI Action: ${action.title}`,
          details: [{ title: 'Action saved', text: `Action ${action.id} is ready in AI Actions for manager follow-up.`, evidenceIds: firstEvidenceIds(response.evidence) }],
          limitations: ['The action is a manager todo. No refund, void, inventory, or campaign activation was executed.'],
        },
        suggestedActions: [{ kind: 'VIEW_REPORT', label: 'Open AI Actions', href: '/ai-actions', evidenceIds: firstEvidenceIds(response.evidence) }],
      };
    }

    if (followUpType === 'CAMPAIGN_DRAFT') {
      const action = await this.actions.create({
        sourceType: AiActionSourceType.AI_ASK,
        sourceId: response.conversationId || undefined,
        sourceTitle: response.question,
        actionType: AiActionType.CREATE_CAMPAIGN_DRAFT,
        priority: AiActionPriority.HIGH,
        title: `Campaign draft from ${response.intent.toLowerCase().replace(/_/g, ' ')}`,
        description: response.answer.summary,
        reason: response.contextUsed.previousIntent ? `Follow-up from ${response.contextUsed.previousIntent}` : response.intent,
        targetType: AiActionTargetType.AI_RECOMMENDATION,
        targetUrl: '/campaigns',
        payload: campaignPayloadForIntent(response.intent, response.evidence),
        evidenceSnapshot: response.evidence.slice(0, 8),
      }, currentUser);
      const draft = await this.actions.createCampaignDraft(action.id, currentUser);
      return {
        ...response,
        contextUsed: { ...response.contextUsed, actionCreated: true, campaignDraftCreated: true },
        answer: {
          headline: 'Campaign draft created.',
          summary: `I created a DRAFT campaign named ${draft.campaign.name}. It is not active until a manager reviews and activates it.`,
          details: [{ title: 'Draft only', text: `Campaign ${draft.campaign.id} was created with status ${draft.campaign.status}.`, evidenceIds: firstEvidenceIds(response.evidence) }],
          limitations: ['The campaign was not activated automatically. Review offer, dates, and eligibility before use.'],
        },
        suggestedActions: [{ kind: 'VIEW_CAMPAIGNS', label: 'Review campaign draft', href: '/campaigns', evidenceIds: firstEvidenceIds(response.evidence) }],
      };
    }
    return response;
  }

  private async tryBossDashboard(range: BusinessDailyRange): Promise<BossDashboardReport | undefined> {
    if (range.preset === 'custom') return undefined;
    try {
      const previous = previousComparableRange(range);
      const [currentRaw, previousRaw] = await Promise.all([
        this.repository.load(this.storeContext.getStoreId(), range),
        this.repository.load(this.storeContext.getStoreId(), previous),
      ]);
      const currentMetrics = this.dailyFallback.generate(range, currentRaw, { generatedBy: 'business-query-baseline', providerLabel: 'fallback', fallback: true }).metrics;
      const previousMetrics = this.dailyFallback.generate(previous, previousRaw, { generatedBy: 'business-query-baseline', providerLabel: 'fallback', fallback: true }).metrics;
      return this.bossFallback.buildDashboard({ range: { ...range, preset: range.preset === 'last7days' ? 'last7days' : range.preset }, current: currentMetrics, previous: previousMetrics, fallback: true });
    } catch {
      return undefined;
    }
  }

  private async tryProviderAnswer(baseline: BusinessQueryResponse): Promise<BusinessQueryResponse> {
    if (process.env.AI_POS_AI_DAILY_FORCE_FALLBACK === 'true' || baseline.intent === 'UNSUPPORTED' || baseline.contextUsed.actionCreated || baseline.contextUsed.campaignDraftCreated) return baseline;
    try {
      const response = await this.deepSeek.generateStructuredResponse({ ...buildBusinessQueryPrompt(baseline), timeoutMs: 10_000 });
      if (!response?.content) return baseline;
      const parsed = JSON.parse(response.content) as Partial<BusinessQueryResponse>;
      return {
        ...baseline,
        answer: cleanAnswer(parsed.answer, baseline.answer, baseline.evidence.map((item) => item.id)),
        fallback: false,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      return baseline;
    }
  }
}

function normalizeDailyQuery(dto: BusinessQueryDtoShape, previousRange?: BusinessQueryResponse['range']): BusinessDailyQueryDto {
  const query = {
    preset: dto.preset ?? previousRange?.preset ?? (dto.from || dto.to ? 'custom' : 'today'),
    from: dto.from ?? (previousRange?.preset === 'custom' ? previousRange.from : undefined),
    to: dto.to ?? (previousRange?.preset === 'custom' ? previousRange.to : undefined),
    timezone: dto.timezone ?? previousRange?.timezone ?? 'Asia/Shanghai',
  } satisfies BusinessDailyQueryDto;
  resolveBusinessDailyRange(query);
  return query;
}

function previousComparableRange(range: BusinessDailyRange): BusinessDailyRange {
  const days = daysBetween(range.from, range.to) + 1;
  const previousTo = formatDate(addDays(parseDate(range.from), -1));
  const previousFrom = formatDate(addDays(parseDate(previousTo), -(days - 1)));
  return { ...range, from: previousFrom, to: previousTo, start: localStartToUtc(previousFrom), end: localEndToUtc(previousTo) };
}

function parseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

function localStartToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

function localEndToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 8 * 60 * 60 * 1000);
}

function cleanAnswer(answer: unknown, fallback: BusinessQueryAnswer, evidenceIds: string[]): BusinessQueryAnswer {
  const candidate = answer as Partial<BusinessQueryAnswer> | undefined;
  if (!candidate) return fallback;
  const details = cleanDetails(candidate.details, fallback.details, evidenceIds);
  return {
    headline: typeof candidate.headline === 'string' && candidate.headline.trim() ? candidate.headline.slice(0, 240) : fallback.headline,
    summary: typeof candidate.summary === 'string' && candidate.summary.trim() ? candidate.summary.slice(0, 800) : fallback.summary,
    details,
    limitations: Array.isArray(candidate.limitations) ? candidate.limitations.filter((item): item is string => typeof item === 'string').slice(0, 5) : fallback.limitations,
  };
}

function cleanDetails(details: unknown, fallbacks: BusinessQueryDetail[], evidenceIds: string[]) {
  const allowed = new Set(evidenceIds);
  if (!Array.isArray(details)) return fallbacks;
  const cleaned = details
    .map((detail, index) => {
      const candidate = detail as Partial<BusinessQueryDetail>;
      const ids = Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds.filter((id): id is string => typeof id === 'string' && allowed.has(id)) : [];
      if (!candidate.title || !candidate.text || ids.length === 0) return fallbacks[index];
      return { title: candidate.title.slice(0, 120), text: candidate.text.slice(0, 600), evidenceIds: ids };
    })
    .filter((detail): detail is BusinessQueryDetail => Boolean(detail?.title && detail.evidenceIds.length > 0));
  return cleaned.length > 0 ? cleaned.slice(0, 6) : fallbacks;
}

function mergeEvidence(items: BusinessQueryEvidence[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 28);
}

function firstEvidenceIds(evidence: BusinessQueryEvidence[]) {
  return evidence[0] ? [evidence[0].id] : [];
}

function drilldownAnswer(evidence: BusinessQueryEvidence[], previousHeadline?: string | null): BusinessQueryAnswer {
  const detailEvidence = evidence.filter((item) => !item.id.startsWith('query_ev_sales_') && !item.id.startsWith('query_ev_refund_total')).slice(0, 6);
  const details = (detailEvidence.length > 0 ? detailEvidence : evidence.slice(0, 3)).map((item) => ({
    title: item.title,
    text: summarizeEvidence(item),
    evidenceIds: [item.id],
  }));
  return {
    headline: detailEvidence.length > 0 ? `Here are ${detailEvidence.length} detail records from the same context.` : 'I found limited detail records for this follow-up.',
    summary: previousHeadline ? `This drills into: ${previousHeadline}` : 'This follow-up expands the previous business question into backend detail evidence.',
    details,
    limitations: detailEvidence.length === 0 ? ['No additional detail records were available in the selected range.'] : [],
  };
}

function commonPatternAnswer(evidence: BusinessQueryEvidence[], previousHeadline?: string | null): BusinessQueryAnswer {
  const typeCounts = evidence.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.type]: (acc[item.type] ?? 0) + 1 }), {});
  const ids = evidence.slice(0, 3).map((item) => item.id);
  return {
    headline: 'The common pattern is based on the repeated evidence types in this conversation.',
    summary: previousHeadline ? `Looking across the previous answer (${previousHeadline}), the strongest shared signals are ${Object.keys(typeCounts).slice(0, 3).join(', ')}.` : `The strongest shared signals are ${Object.keys(typeCounts).slice(0, 3).join(', ')}.`,
    details: [{ title: 'Shared evidence pattern', text: `Evidence mix: ${Object.entries(typeCounts).map(([key, count]) => `${key} ${count}`).join(', ')}.`, evidenceIds: ids }],
    limitations: ['This is a pattern summary from saved evidence, not a free-form database search.'],
  };
}

function nextActionAnswer(intent: BusinessQueryIntent, evidence: BusinessQueryEvidence[]): BusinessQueryAnswer {
  const ids = firstEvidenceIds(evidence);
  return {
    headline: 'Recommended next step: review the evidence and save a manager action if follow-up is needed.',
    summary: `For ${intent}, keep this human-in-the-loop: inspect the target page, then save or dismiss an AI Action.`,
    details: [{ title: 'Manager action', text: 'Use the suggested actions below to open the relevant business page or save this follow-up to AI Actions.', evidenceIds: ids }],
    limitations: ['No high-risk business action was executed automatically.'],
  };
}

function sideEffectPendingAnswer(headline: string, evidence: BusinessQueryEvidence[]): BusinessQueryAnswer {
  return {
    headline,
    summary: 'I will use the current conversation evidence snapshot and keep the action scoped to this store.',
    details: [{ title: 'Evidence snapshot', text: 'The saved result will include the current evidence snapshot for later review.', evidenceIds: firstEvidenceIds(evidence) }],
    limitations: ['This request cannot bypass manager review or activate campaigns automatically.'],
  };
}

function summarizeEvidence(item: BusinessQueryEvidence) {
  const detail = item.detail ? Object.entries(item.detail).slice(0, 5).map(([key, value]) => `${key}: ${String(value)}`).join(', ') : '';
  return detail || `${item.title}: ${String(item.value ?? 'available')}`;
}

function actionTypeForIntent(intent: BusinessQueryIntent): AiActionType {
  if (intent === 'REFUND_ANALYSIS') return AiActionType.REVIEW_REFUND;
  if (intent === 'PRODUCT_ANALYSIS') return AiActionType.VIEW_PRODUCT;
  if (intent === 'CUSTOMER_ANALYSIS') return AiActionType.REVIEW_CUSTOMER_REACTIVATION;
  if (intent === 'CAMPAIGN_ANALYSIS') return AiActionType.VIEW_CAMPAIGN;
  if (intent === 'KITCHEN_ANALYSIS') return AiActionType.REVIEW_KITCHEN_OVERDUE;
  if (intent === 'TABLE_ANALYSIS') return AiActionType.VIEW_TABLE;
  if (intent === 'APPROVAL_ANALYSIS') return AiActionType.REVIEW_DISCOUNT;
  return AiActionType.VIEW_REPORT;
}

function priorityForIntent(intent: BusinessQueryIntent): AiActionPriority {
  if (['REFUND_ANALYSIS', 'KITCHEN_ANALYSIS', 'APPROVAL_ANALYSIS'].includes(intent)) return AiActionPriority.HIGH;
  if (['CUSTOMER_ANALYSIS', 'PRODUCT_ANALYSIS', 'CAMPAIGN_ANALYSIS'].includes(intent)) return AiActionPriority.MEDIUM;
  return AiActionPriority.LOW;
}

function targetTypeForAction(actionType: AiActionType): AiActionTargetType {
  if (actionType === AiActionType.VIEW_PRODUCT) return AiActionTargetType.PRODUCT;
  if (actionType === AiActionType.REVIEW_CUSTOMER_REACTIVATION || actionType === AiActionType.VIEW_CUSTOMER) return AiActionTargetType.CUSTOMER;
  if (actionType === AiActionType.VIEW_CAMPAIGN || actionType === AiActionType.CREATE_CAMPAIGN_DRAFT) return AiActionTargetType.CAMPAIGN;
  if (actionType === AiActionType.REVIEW_KITCHEN_OVERDUE || actionType === AiActionType.VIEW_KITCHEN) return AiActionTargetType.KITCHEN_STATION;
  if (actionType === AiActionType.VIEW_TABLE) return AiActionTargetType.TABLE;
  return AiActionTargetType.REPORT;
}

function targetUrlForAction(actionType: AiActionType) {
  if (actionType === AiActionType.VIEW_PRODUCT) return '/products';
  if (actionType === AiActionType.REVIEW_CUSTOMER_REACTIVATION || actionType === AiActionType.VIEW_CUSTOMER) return '/customers';
  if (actionType === AiActionType.VIEW_CAMPAIGN || actionType === AiActionType.CREATE_CAMPAIGN_DRAFT) return '/campaigns';
  if (actionType === AiActionType.REVIEW_KITCHEN_OVERDUE || actionType === AiActionType.VIEW_KITCHEN) return '/kitchen';
  if (actionType === AiActionType.VIEW_TABLE) return '/tables';
  return '/reports';
}

function campaignPayloadForIntent(intent: BusinessQueryIntent, evidence: BusinessQueryEvidence[]) {
  const productId = evidence.map((item) => item.detail?.productId).find((value): value is string => typeof value === 'string');
  const customerEvidence = evidence.find((item) => item.type === 'CUSTOMER');
  return {
    draftPayload: {
      campaignType: productId ? CampaignType.ITEM_DISCOUNT : CampaignType.PROMO_CODE,
      discountType: 'percentage',
      discountValue: intent === 'CUSTOMER_ANALYSIS' || customerEvidence ? 15 : 10,
      productId: productId ?? undefined,
      customerEligibilityMode: customerEvidence ? CustomerEligibilityMode.CUSTOMER_ONLY : CustomerEligibilityMode.ALL_CUSTOMERS,
      suggestedDurationDays: 7,
      bannerCopy: customerEvidence ? 'Welcome back offer.' : 'Manager-reviewed AI offer.',
      staffMessage: 'Review this AI draft before activation.',
    },
  };
}
