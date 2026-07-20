import { BadRequestException } from '@nestjs/common';
import { Campaign, CampaignStatus, CampaignType, CustomerEligibilityMode, CustomerSegmentStatus, Prisma, PromotionStackingPolicy } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { toMoneyNumber } from '@/common/utils/money';

type CampaignReader = {
  findMany(input: Prisma.CampaignFindManyArgs): Promise<PromotionCampaign[]>;
};

type SegmentMemberReader = {
  findMany(input: Prisma.CustomerSegmentMemberFindManyArgs): Promise<Array<{ segmentId: string }>>;
};

type PromotionCampaign = Campaign & {
  targetCustomerSegment?: { name: string; status: CustomerSegmentStatus } | null;
};

export type PromotionEvaluationInput = {
  storeId: string;
  subtotal: Decimal;
  items: Array<{ productId: string; productCategorySnapshot: string | null; lineTotal: Decimal }>;
  promoCode?: string;
  selectedPromotionIds?: string[];
  resolvedCustomerId?: string | null;
};

export type PromotionRejectedReasonCode =
  | 'CAMPAIGN_NOT_ACTIVE'
  | 'CAMPAIGN_EXPIRED'
  | 'PROMO_CODE_NOT_MATCHED'
  | 'ORDER_THRESHOLD_NOT_MET'
  | 'PRODUCT_NOT_MATCHED'
  | 'CUSTOMER_REQUIRED'
  | 'CUSTOMER_NOT_IN_SEGMENT'
  | 'SEGMENT_NOT_ACTIVE'
  | 'USAGE_LIMIT_REACHED'
  | 'PROMO_CODE_NOT_ELIGIBLE_FOR_CUSTOMER';

export type PromotionEvaluationOptions = {
  includePreviewDetails?: boolean;
  throwOnExplicitIneligible?: boolean;
};

type CampaignDiscountResult = {
  campaign: PromotionCampaign;
  discountAmount: Decimal;
  rejectedReasonCode?: PromotionRejectedReasonCode;
};

export async function evaluateCheckoutPromotions(
  source: { campaign?: CampaignReader; customerSegmentMember?: SegmentMemberReader } | undefined,
  input: PromotionEvaluationInput,
  options: PromotionEvaluationOptions = {},
) {
  // Checkout asks for a promotion result, while this adapter owns campaign status, code matching, usage limits, and stacking policy details.
  if (!source?.campaign) {
    return { discountAmount: new Decimal(0), appliedPromotions: [], eligiblePromotions: [], rejectedPromotions: [] };
  }
  const now = new Date();
  const normalizedCode = input.promoCode?.trim().toUpperCase();
  const campaigns = await source.campaign.findMany({
    where: options.includePreviewDetails
      ? { storeId: input.storeId }
      : {
          storeId: input.storeId,
          status: CampaignStatus.ACTIVE,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
    include: { targetCustomerSegment: { select: { name: true, status: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });
  const customerSegmentIds = await resolveCustomerSegmentIds(source.customerSegmentMember, input);
  const selected = new Set(input.selectedPromotionIds ?? []);
  const candidates = campaigns
    .filter((campaign) => selected.size === 0 || selected.has(campaign.id) || campaign.promoCode?.toUpperCase() === normalizedCode)
    .filter((campaign) => options.includePreviewDetails || campaign.type !== CampaignType.PROMO_CODE || (normalizedCode && campaign.promoCode?.toUpperCase() === normalizedCode));
  const evaluated = candidates.map((campaign) => evaluateCampaign(campaign, input, customerSegmentIds, now, normalizedCode));
  const matchingPromoCode = normalizedCode ? evaluated.filter((result) => result.campaign.promoCode?.toUpperCase() === normalizedCode) : [];
  if (
    normalizedCode &&
    options.throwOnExplicitIneligible !== false &&
    matchingPromoCode.length > 0 &&
    !matchingPromoCode.some((result) => !result.rejectedReasonCode)
  ) {
    throw new BadRequestException({
      code: 'PROMO_CODE_NOT_ELIGIBLE_FOR_CUSTOMER',
      message: 'This customer is not eligible for this promotion.',
    });
  }
  const discounts = evaluated.filter((result) => !result.rejectedReasonCode && result.discountAmount.greaterThan(0));
  if (discounts.length === 0) {
    return {
      discountAmount: new Decimal(0),
      appliedPromotions: [],
      eligiblePromotions: options.includePreviewDetails ? [] : undefined,
      rejectedPromotions: options.includePreviewDetails ? evaluated.filter((result) => result.rejectedReasonCode).map(toRejectedPromotion) : undefined,
    };
  }
  const bestOnly = discounts.some((result) => result.campaign.stackingPolicy === PromotionStackingPolicy.BEST_ONLY || result.campaign.stackingPolicy === PromotionStackingPolicy.EXCLUSIVE);
  const applied = bestOnly ? [discounts.sort((a, b) => b.discountAmount.comparedTo(a.discountAmount))[0]] : discounts;
  const discountAmount = Decimal.min(input.subtotal, applied.reduce((sum, result) => sum.plus(result.discountAmount), new Decimal(0))).toDecimalPlaces(2);
  return {
    discountAmount,
    appliedPromotions: applied.map(toAppliedPromotion),
    eligiblePromotions: options.includePreviewDetails ? discounts.map(toEligiblePromotion) : undefined,
    rejectedPromotions: options.includePreviewDetails ? evaluated.filter((result) => result.rejectedReasonCode).map(toRejectedPromotion) : undefined,
  };
}

async function resolveCustomerSegmentIds(segmentMemberReader: SegmentMemberReader | undefined, input: PromotionEvaluationInput) {
  if (!input.resolvedCustomerId || !segmentMemberReader) return new Set<string>();
  const rows = await segmentMemberReader.findMany({
    where: {
      storeId: input.storeId,
      customerId: input.resolvedCustomerId,
      segment: { status: CustomerSegmentStatus.ACTIVE },
    },
    select: { segmentId: true },
    take: 100,
  });
  return new Set(rows.map((row) => row.segmentId));
}

function evaluateCampaign(campaign: PromotionCampaign, input: PromotionEvaluationInput, customerSegmentIds: Set<string>, now: Date, normalizedCode?: string): CampaignDiscountResult {
  const availabilityReason = getAvailabilityRejectedReason(campaign, now, normalizedCode);
  if (availabilityReason) return { campaign, discountAmount: new Decimal(0), rejectedReasonCode: availabilityReason };

  const customerReason = getCustomerRejectedReason(campaign, input.resolvedCustomerId, customerSegmentIds, normalizedCode);
  if (customerReason) return { campaign, discountAmount: new Decimal(0), rejectedReasonCode: customerReason };

  return calculatePromotionDiscount(campaign, input);
}

function getAvailabilityRejectedReason(campaign: PromotionCampaign, now: Date, normalizedCode?: string): PromotionRejectedReasonCode | undefined {
  if (campaign.status !== CampaignStatus.ACTIVE) return 'CAMPAIGN_NOT_ACTIVE';
  if ((campaign.startsAt && campaign.startsAt > now) || (campaign.endsAt && campaign.endsAt < now)) return 'CAMPAIGN_EXPIRED';
  if (campaign.usageLimit && campaign.usageCount >= campaign.usageLimit) return 'USAGE_LIMIT_REACHED';
  if (campaign.type === CampaignType.PROMO_CODE && (!normalizedCode || campaign.promoCode?.toUpperCase() !== normalizedCode)) return 'PROMO_CODE_NOT_MATCHED';
  return undefined;
}

function getCustomerRejectedReason(campaign: PromotionCampaign, customerId: string | null | undefined, customerSegmentIds: Set<string>, normalizedCode?: string): PromotionRejectedReasonCode | undefined {
  if (campaign.customerEligibilityMode === CustomerEligibilityMode.ALL_CUSTOMERS) return undefined;
  if (!customerId) return 'CUSTOMER_REQUIRED';
  if (campaign.customerEligibilityMode === CustomerEligibilityMode.CUSTOMER_ONLY) return undefined;
  if (campaign.customerEligibilityMode === CustomerEligibilityMode.SEGMENT_ONLY) {
    if (!campaign.targetCustomerSegmentId || campaign.targetCustomerSegment?.status !== CustomerSegmentStatus.ACTIVE) return 'SEGMENT_NOT_ACTIVE';
    if (!customerSegmentIds.has(campaign.targetCustomerSegmentId)) {
      return normalizedCode && campaign.promoCode?.toUpperCase() === normalizedCode ? 'PROMO_CODE_NOT_ELIGIBLE_FOR_CUSTOMER' : 'CUSTOMER_NOT_IN_SEGMENT';
    }
  }
  return undefined;
}

function calculatePromotionDiscount(campaign: PromotionCampaign, input: { subtotal: Decimal; items: Array<{ productId: string; productCategorySnapshot: string | null; lineTotal: Decimal }> }): CampaignDiscountResult {
  let base = input.subtotal;
  if (campaign.type === CampaignType.THRESHOLD_DISCOUNT) {
    if (!campaign.thresholdAmount || input.subtotal.lessThan(campaign.thresholdAmount)) return { campaign, discountAmount: new Decimal(0), rejectedReasonCode: 'ORDER_THRESHOLD_NOT_MET' };
  }
  if (campaign.type === CampaignType.ITEM_DISCOUNT) {
    base = input.items
      .filter((item) => (campaign.productId ? item.productId === campaign.productId : true) && (campaign.categoryName ? item.productCategorySnapshot === campaign.categoryName : true))
      .reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0))
      .toDecimalPlaces(2);
    if (base.lessThanOrEqualTo(0)) return { campaign, discountAmount: new Decimal(0), rejectedReasonCode: 'PRODUCT_NOT_MATCHED' };
  }
  const value = new Decimal(campaign.discountValue ?? 0);
  const type = campaign.discountType ?? 'percentage';
  const discountAmount = type === 'fixed_amount' || type === 'fixed_reduction'
    ? value
    : base.mul(value).div(100).toDecimalPlaces(2);
  return { campaign, discountAmount: Decimal.min(base, discountAmount).toDecimalPlaces(2) };
}

function toAppliedPromotion(result: CampaignDiscountResult) {
  return {
    id: result.campaign.id,
    campaignId: result.campaign.id,
    name: result.campaign.name,
    type: result.campaign.type,
    campaignType: result.campaign.type,
    promoCode: result.campaign.promoCode,
    customerEligibilityMode: result.campaign.customerEligibilityMode,
    targetCustomerSegmentId: result.campaign.targetCustomerSegmentId,
    targetCustomerSegmentName: result.campaign.targetCustomerSegment?.name ?? null,
    discountAmount: toMoneyNumber(result.discountAmount),
  };
}

function toEligiblePromotion(result: CampaignDiscountResult) {
  return {
    campaignId: result.campaign.id,
    name: result.campaign.name,
    campaignType: result.campaign.type,
    promoCode: result.campaign.promoCode,
    customerEligibilityMode: result.campaign.customerEligibilityMode,
    targetCustomerSegmentName: result.campaign.targetCustomerSegment?.name ?? null,
    estimatedDiscountAmount: toMoneyNumber(result.discountAmount),
    reason: 'PROMOTION_ELIGIBLE',
  };
}

function toRejectedPromotion(result: CampaignDiscountResult) {
  const reasonCode = result.rejectedReasonCode ?? 'CAMPAIGN_NOT_ACTIVE';
  return {
    campaignId: result.campaign.id,
    name: result.campaign.name,
    campaignType: result.campaign.type,
    promoCode: result.campaign.promoCode,
    customerEligibilityMode: result.campaign.customerEligibilityMode,
    targetCustomerSegmentName: result.campaign.targetCustomerSegment?.name ?? null,
    reasonCode,
    message: messageForReason(reasonCode),
  };
}

function messageForReason(reasonCode: PromotionRejectedReasonCode) {
  if (reasonCode === 'CUSTOMER_REQUIRED') return 'Please attach a customer before using this promotion.';
  if (reasonCode === 'CUSTOMER_NOT_IN_SEGMENT' || reasonCode === 'PROMO_CODE_NOT_ELIGIBLE_FOR_CUSTOMER') return 'This customer is not eligible for this promotion.';
  if (reasonCode === 'ORDER_THRESHOLD_NOT_MET') return 'Order does not meet the promotion threshold.';
  if (reasonCode === 'PRODUCT_NOT_MATCHED') return 'Cart items do not match this promotion.';
  if (reasonCode === 'USAGE_LIMIT_REACHED') return 'Promotion usage limit has been reached.';
  if (reasonCode === 'CAMPAIGN_EXPIRED') return 'Promotion is not within its valid period.';
  if (reasonCode === 'PROMO_CODE_NOT_MATCHED') return 'Promo code does not match this promotion.';
  if (reasonCode === 'SEGMENT_NOT_ACTIVE') return 'Target customer segment is not active.';
  return 'Promotion is not active.';
}
