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
  targetCustomerSegment?: { status: CustomerSegmentStatus } | null;
};

export type PromotionEvaluationInput = {
  storeId: string;
  subtotal: Decimal;
  items: Array<{ productId: string; productCategorySnapshot: string | null; lineTotal: Decimal }>;
  promoCode?: string;
  selectedPromotionIds?: string[];
  resolvedCustomerId?: string | null;
};

export async function evaluateCheckoutPromotions(source: { campaign?: CampaignReader; customerSegmentMember?: SegmentMemberReader } | undefined, input: PromotionEvaluationInput) {
  // Checkout asks for a promotion result, while this adapter owns campaign status, code matching, usage limits, and stacking policy details.
  if (!source?.campaign) {
    return { discountAmount: new Decimal(0), appliedPromotions: [] };
  }
  const now = new Date();
  const normalizedCode = input.promoCode?.trim().toUpperCase();
  const campaigns = await source.campaign.findMany({
    where: {
      storeId: input.storeId,
      status: CampaignStatus.ACTIVE,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: { targetCustomerSegment: { select: { status: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });
  const customerSegmentIds = await resolveCustomerSegmentIds(source.customerSegmentMember, input);
  const selected = new Set(input.selectedPromotionIds ?? []);
  const candidates = campaigns
    .filter((campaign) => !campaign.usageLimit || campaign.usageCount < campaign.usageLimit)
    .filter((campaign) => selected.size === 0 || selected.has(campaign.id) || campaign.promoCode?.toUpperCase() === normalizedCode)
    .filter((campaign) => campaign.type !== CampaignType.PROMO_CODE || (normalizedCode && campaign.promoCode?.toUpperCase() === normalizedCode));
  const eligibility = candidates.map((campaign) => ({ campaign, eligible: isCampaignEligibleForCustomer(campaign, input.resolvedCustomerId, customerSegmentIds) }));
  if (normalizedCode && eligibility.some((item) => item.campaign.promoCode?.toUpperCase() === normalizedCode) && !eligibility.some((item) => item.campaign.promoCode?.toUpperCase() === normalizedCode && item.eligible)) {
    throw new BadRequestException({
      code: 'PROMO_CODE_NOT_ELIGIBLE_FOR_CUSTOMER',
      message: 'This customer is not eligible for this promotion.',
    });
  }
  const discounts = eligibility
    .filter((item) => item.eligible)
    .map((item) => item.campaign)
    .map((campaign) => calculatePromotionDiscount(campaign, input))
    .filter((result) => result.discountAmount.greaterThan(0));
  if (discounts.length === 0) {
    return { discountAmount: new Decimal(0), appliedPromotions: [] };
  }
  const bestOnly = discounts.some((result) => result.campaign.stackingPolicy === PromotionStackingPolicy.BEST_ONLY || result.campaign.stackingPolicy === PromotionStackingPolicy.EXCLUSIVE);
  const applied = bestOnly ? [discounts.sort((a, b) => b.discountAmount.comparedTo(a.discountAmount))[0]] : discounts;
  const discountAmount = Decimal.min(input.subtotal, applied.reduce((sum, result) => sum.plus(result.discountAmount), new Decimal(0))).toDecimalPlaces(2);
  return {
    discountAmount,
    appliedPromotions: applied.map((result) => ({
      id: result.campaign.id,
      name: result.campaign.name,
      type: result.campaign.type,
      promoCode: result.campaign.promoCode,
      customerEligibilityMode: result.campaign.customerEligibilityMode,
      targetCustomerSegmentId: result.campaign.targetCustomerSegmentId,
      discountAmount: toMoneyNumber(result.discountAmount),
    })),
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

function isCampaignEligibleForCustomer(campaign: PromotionCampaign, customerId: string | null | undefined, customerSegmentIds: Set<string>) {
  if (campaign.customerEligibilityMode === CustomerEligibilityMode.ALL_CUSTOMERS) return true;
  if (!customerId) return false;
  if (campaign.customerEligibilityMode === CustomerEligibilityMode.CUSTOMER_ONLY) return true;
  if (campaign.customerEligibilityMode === CustomerEligibilityMode.SEGMENT_ONLY) {
    if (!campaign.targetCustomerSegmentId || campaign.targetCustomerSegment?.status !== CustomerSegmentStatus.ACTIVE) return false;
    return customerSegmentIds.has(campaign.targetCustomerSegmentId);
  }
  return true;
}

function calculatePromotionDiscount(campaign: Campaign, input: { subtotal: Decimal; items: Array<{ productId: string; productCategorySnapshot: string | null; lineTotal: Decimal }> }) {
  let base = input.subtotal;
  if (campaign.type === CampaignType.THRESHOLD_DISCOUNT) {
    if (!campaign.thresholdAmount || input.subtotal.lessThan(campaign.thresholdAmount)) return { campaign, discountAmount: new Decimal(0) };
  }
  if (campaign.type === CampaignType.ITEM_DISCOUNT) {
    base = input.items
      .filter((item) => (campaign.productId ? item.productId === campaign.productId : true) && (campaign.categoryName ? item.productCategorySnapshot === campaign.categoryName : true))
      .reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0))
      .toDecimalPlaces(2);
    if (base.lessThanOrEqualTo(0)) return { campaign, discountAmount: new Decimal(0) };
  }
  const value = new Decimal(campaign.discountValue ?? 0);
  const type = campaign.discountType ?? 'percentage';
  const discountAmount = type === 'fixed_amount' || type === 'fixed_reduction'
    ? value
    : base.mul(value).div(100).toDecimalPlaces(2);
  return { campaign, discountAmount: Decimal.min(base, discountAmount).toDecimalPlaces(2) };
}
