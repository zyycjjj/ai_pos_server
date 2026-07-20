import { Campaign, CampaignStatus, CampaignType, Prisma, PromotionStackingPolicy } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { toMoneyNumber } from '@/common/utils/money';

type CampaignReader = {
  findMany(input: Prisma.CampaignFindManyArgs): Promise<Campaign[]>;
};

export type PromotionEvaluationInput = {
  storeId: string;
  subtotal: Decimal;
  items: Array<{ productId: string; productCategorySnapshot: string | null; lineTotal: Decimal }>;
  promoCode?: string;
  selectedPromotionIds?: string[];
};

export async function evaluateCheckoutPromotions(campaignReader: CampaignReader | undefined, input: PromotionEvaluationInput) {
  // Checkout asks for a promotion result, while this adapter owns campaign status, code matching, usage limits, and stacking policy details.
  if (!campaignReader) {
    return { discountAmount: new Decimal(0), appliedPromotions: [] };
  }
  const now = new Date();
  const normalizedCode = input.promoCode?.trim().toUpperCase();
  const campaigns = await campaignReader.findMany({
    where: {
      storeId: input.storeId,
      status: CampaignStatus.ACTIVE,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });
  const selected = new Set(input.selectedPromotionIds ?? []);
  const candidates = campaigns
    .filter((campaign) => !campaign.usageLimit || campaign.usageCount < campaign.usageLimit)
    .filter((campaign) => selected.size === 0 || selected.has(campaign.id) || campaign.promoCode?.toUpperCase() === normalizedCode)
    .filter((campaign) => campaign.type !== CampaignType.PROMO_CODE || (normalizedCode && campaign.promoCode?.toUpperCase() === normalizedCode));
  const discounts = candidates
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
      discountAmount: toMoneyNumber(result.discountAmount),
    })),
  };
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
