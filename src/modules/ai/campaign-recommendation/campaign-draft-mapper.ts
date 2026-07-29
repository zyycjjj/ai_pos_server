import { CampaignStatus, CustomerEligibilityMode, CustomerSegmentStatus, CustomerSegmentType, PromotionStackingPolicy } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';
import type { PrismaService } from '@/prisma/prisma.service';

import type { AuthRequestUser } from '@/modules/auth/auth.types';
import type { BusinessDailyEvidence } from '../business-daily/business-daily.types';
import type { AiCampaignDraftAdjustments, AiCampaignDraftMetadata, AiCampaignRecommendation } from './campaign-recommendation.types';

export async function createCampaignDraftFromRecommendation(input: {
  prisma: PrismaService;
  storeId: string;
  currentUser: AuthRequestUser;
  recommendation: AiCampaignRecommendation;
  evidence: BusinessDailyEvidence[];
  adjustments?: AiCampaignDraftAdjustments;
}) {
  const draft = input.recommendation.draftPayload;
  if (!draft) throw new Error('Recommendation does not support campaign draft creation.');
  const startsAt = startOfTomorrow();
  const durationDays = clampInt(Number(input.adjustments?.durationDays ?? draft.durationDays), 1, 30);
  const endsAt = addDays(startsAt, durationDays);
  const discountValue = clampNumber(Number(input.adjustments?.discountValue ?? draft.discountValue ?? 0), 0, 1000);
  const threshold = input.adjustments?.threshold !== undefined ? Number(input.adjustments.threshold) : draft.thresholdAmount ?? null;
  const targetCustomerSegmentId = await ensureTargetSegment({
    prisma: input.prisma,
    storeId: input.storeId,
    recommendation: input.recommendation,
    segmentName: draft.segmentName,
    segmentRule: draft.segmentRule,
  });
  const metadata: AiCampaignDraftMetadata = {
    aiGenerated: true,
    aiSource: 'ai_campaign_recommendation',
    aiRecommendationType: input.recommendation.type,
    aiRecommendationId: input.recommendation.id,
    aiReason: input.recommendation.reason,
    aiEvidenceSnapshot: input.evidence,
    aiExpectedImpact: input.recommendation.expectedImpact,
    aiTarget: input.recommendation.target,
    aiOffer: { ...input.recommendation.offer, discountValue, threshold: threshold ?? undefined, suggestedDurationDays: durationDays },
    aiCreatedAt: new Date().toISOString(),
    aiRequiresManualCompletion: draft.requiresManualCompletion,
  };

  const campaign = await input.prisma.campaign.create({
    data: {
      storeId: input.storeId,
      name: (input.adjustments?.title?.trim() || input.recommendation.title).slice(0, 120),
      goal: input.recommendation.goal,
      status: CampaignStatus.DRAFT,
      type: draft.campaignType,
      discountType: draft.discountType ?? 'percentage',
      discountValue,
      thresholdAmount: threshold,
      promoCode: draft.promoCode?.trim().toUpperCase() ?? null,
      productId: draft.productId ?? null,
      customerEligibilityMode: draft.customerEligibilityMode,
      targetCustomerSegmentId: draft.customerEligibilityMode === CustomerEligibilityMode.SEGMENT_ONLY ? targetCustomerSegmentId : null,
      stackingPolicy: PromotionStackingPolicy.BEST_ONLY,
      startsAt,
      endsAt,
      usageLimit: defaultUsageLimit(draft.customerEligibilityMode),
      timeWindow: draft.timeWindow ?? null,
      bannerCopy: draft.bannerCopy,
      staffMessage: draft.staffMessage,
      createdById: input.currentUser.id,
      structuredJson: {
        source: 'ai_campaign_recommendation',
        aiMetadata: metadata as unknown as Prisma.InputJsonValue,
      } satisfies Prisma.InputJsonObject,
    },
  });

  return {
    campaign: presentCampaign(campaign),
    aiMetadata: metadata,
    status: campaign.status,
  };
}

async function ensureTargetSegment(input: {
  prisma: PrismaService;
  storeId: string;
  recommendation: AiCampaignRecommendation;
  segmentName?: string;
  segmentRule?: Record<string, number>;
}) {
  if (!input.segmentName || !input.segmentRule) return null;
  const existing = await input.prisma.customerSegment.findFirst({
    where: { storeId: input.storeId, name: input.segmentName },
  });
  const segment = existing ?? await input.prisma.customerSegment.create({
    data: {
      storeId: input.storeId,
      name: input.segmentName,
      description: `AI generated segment for ${input.recommendation.type}`,
      status: CustomerSegmentStatus.ACTIVE,
      type: CustomerSegmentType.SMART_RULE,
      ruleJson: input.segmentRule as Prisma.InputJsonValue,
    },
  });
  await evaluateSegment(input.prisma, input.storeId, segment.id, input.segmentRule);
  return segment.id;
}

async function evaluateSegment(prisma: PrismaService, storeId: string, segmentId: string, rule: Record<string, number>) {
  const now = new Date();
  const customers = await prisma.customer.findMany({ where: { storeId, status: { not: 'BLOCKED' } }, orderBy: { createdAt: 'asc' } });
  const matched = customers.filter((customer) => matchesRule(rule, customer, now));
  await prisma.$transaction(async (tx) => {
    await tx.customerSegmentMember.deleteMany({ where: { segmentId } });
    if (matched.length > 0) {
      await tx.customerSegmentMember.createMany({
        data: matched.map((customer) => ({
          storeId,
          segmentId,
          customerId: customer.id,
          matchedAt: now,
          ruleSnapshot: rule as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
    }
    await tx.customerSegment.update({ where: { id: segmentId }, data: { memberCount: matched.length, lastEvaluatedAt: now } });
  });
}

function matchesRule(rule: Record<string, number>, customer: { orderCount: number; totalSpend: unknown; pointsBalance: number; lastOrderAt: Date | null }, now: Date) {
  const totalSpend = Number(customer.totalSpend);
  if (rule.minOrderCount !== undefined && customer.orderCount < rule.minOrderCount) return false;
  if (rule.minTotalSpend !== undefined && totalSpend < rule.minTotalSpend) return false;
  if (rule.lastOrderBeforeDays !== undefined) {
    if (!customer.lastOrderAt || customer.lastOrderAt > daysAgo(now, rule.lastOrderBeforeDays)) return false;
  }
  if (rule.lastOrderWithinDays !== undefined) {
    if (!customer.lastOrderAt || customer.lastOrderAt < daysAgo(now, rule.lastOrderWithinDays)) return false;
  }
  return true;
}

function presentCampaign(campaign: Awaited<ReturnType<PrismaService['campaign']['create']>>) {
  return {
    id: campaign.id,
    name: campaign.name,
    goal: campaign.goal,
    type: campaign.type,
    discountType: campaign.discountType,
    discountValue: campaign.discountValue,
    thresholdAmount: campaign.thresholdAmount ? toMoneyNumber(campaign.thresholdAmount) : null,
    promoCode: campaign.promoCode,
    productId: campaign.productId,
    categoryName: campaign.categoryName,
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    customerEligibilityMode: campaign.customerEligibilityMode,
    targetCustomerSegmentId: campaign.targetCustomerSegmentId,
    stackingPolicy: campaign.stackingPolicy,
    usageLimit: campaign.usageLimit,
    usageCount: campaign.usageCount,
    discountTotal: toMoneyNumber(campaign.discountTotal),
    timeWindow: campaign.timeWindow,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    aiMetadata: readAiMetadata(campaign.structuredJson),
  };
}

function readAiMetadata(value: unknown) {
  return value && typeof value === 'object' && 'aiMetadata' in value ? (value as { aiMetadata: unknown }).aiMetadata : null;
}

function defaultUsageLimit(mode: CustomerEligibilityMode) {
  return mode === CustomerEligibilityMode.ALL_CUSTOMERS ? null : 100;
}

function startOfTomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
