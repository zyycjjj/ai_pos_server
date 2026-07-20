import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CampaignStatus, CampaignType, CustomerEligibilityMode, CustomerSegmentStatus, PromotionStackingPolicy } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { evaluateCheckoutPromotions } from './checkout-promotion.adapter';

describe('customer-targeted checkout promotions', () => {
  it('applies segment-only promo codes only for matching customer members', async () => {
    const source = sourceFor([campaign({ customerEligibilityMode: CustomerEligibilityMode.SEGMENT_ONLY, targetCustomerSegmentId: 'segment-vip', promoCode: 'VIP10' })], ['segment-vip']);
    const result = await evaluateCheckoutPromotions(source, {
      storeId: 'store-1',
      subtotal: new Decimal(100),
      items: [],
      promoCode: 'VIP10',
      resolvedCustomerId: 'customer-vip',
    });

    assert.equal(result.discountAmount.toNumber(), 10);
    assert.equal(result.appliedPromotions[0].targetCustomerSegmentId, 'segment-vip');
  });

  it('rejects promo code when the bound customer is outside the target segment', async () => {
    const source = sourceFor([campaign({ customerEligibilityMode: CustomerEligibilityMode.SEGMENT_ONLY, targetCustomerSegmentId: 'segment-vip', promoCode: 'VIP10' })], []);
    await assert.rejects(
      () =>
        evaluateCheckoutPromotions(source, {
          storeId: 'store-1',
          subtotal: new Decimal(100),
          items: [],
          promoCode: 'VIP10',
          resolvedCustomerId: 'customer-normal',
        }),
      /not eligible/,
    );
  });

  it('keeps all-customer campaigns available for anonymous checkout', async () => {
    const source = sourceFor([campaign({ customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS, promoCode: 'SAVE10' })], []);
    const result = await evaluateCheckoutPromotions(source, {
      storeId: 'store-1',
      subtotal: new Decimal(100),
      items: [],
      promoCode: 'SAVE10',
    });

    assert.equal(result.discountAmount.toNumber(), 10);
  });
});

function sourceFor(campaigns: ReturnType<typeof campaign>[], segmentIds: string[]) {
  return {
    campaign: {
      findMany: async () => campaigns,
    },
    customerSegmentMember: {
      findMany: async () => segmentIds.map((segmentId) => ({ segmentId })),
    },
  };
}

function campaign(input: Partial<Record<string, unknown>>) {
  return { ...baseCampaign(), ...input };
}

function baseCampaign() {
  const now = new Date('2026-07-20T00:00:00.000Z');
  return {
    id: 'campaign-1',
    storeId: 'store-1',
    name: 'VIP',
    goal: null,
    status: CampaignStatus.ACTIVE,
    type: CampaignType.PROMO_CODE,
    stackingPolicy: PromotionStackingPolicy.BEST_ONLY,
    discountType: 'percentage',
    discountValue: 10,
    thresholdAmount: null,
    promoCode: 'VIP10',
    productId: null,
    categoryName: null,
    customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS,
    targetCustomerSegmentId: null,
    targetCustomerSegment: { status: CustomerSegmentStatus.ACTIVE },
    startsAt: null,
    endsAt: null,
    priority: 0,
    usageLimit: null,
    usageCount: 0,
    discountTotal: new Decimal(0),
    timeWindow: null,
    bannerCopy: null,
    staffMessage: null,
    structuredJson: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
  };
}
