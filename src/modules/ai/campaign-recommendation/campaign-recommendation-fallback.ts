import { Injectable } from '@nestjs/common';
import { CampaignType, CustomerEligibilityMode } from '@prisma/client';

import type { BusinessDailyEvidence, BusinessDailyReport } from '../business-daily/business-daily.types';
import type { AiCampaignRecommendation } from './campaign-recommendation.types';

@Injectable()
export class CampaignRecommendationFallback {
  generate(report: BusinessDailyReport): AiCampaignRecommendation[] {
    const evidence = new EvidenceIndex(report.evidence);
    const salesEvidence = evidence.first('METRIC') ?? report.evidence[0];
    const customerEvidence = evidence.first('CUSTOMER') ?? salesEvidence;
    const productEvidence = evidence.first('PRODUCT') ?? salesEvidence;
    const kitchenEvidence = evidence.first('KITCHEN') ?? salesEvidence;
    const aovThreshold = roundToNiceThreshold(Math.max(20, report.metrics.sales.averageOrderValue * 1.2));
    const items: AiCampaignRecommendation[] = [
      {
        id: 'rec_campaign_customer_reactivation',
        type: 'CUSTOMER_REACTIVATION',
        priority: report.metrics.customer.dormantCustomers.length > 0 ? 'HIGH' : 'MEDIUM',
        title: 'Win back quiet customers with a small promo code',
        goal: 'Bring recent customers back without discounting every order.',
        reason: report.metrics.customer.dormantCustomers.length > 0
          ? `${report.metrics.customer.dormantCustomers.length} dormant customers were found in the customer evidence.`
          : 'data_insufficient: Keep this as a draft until the customer list is reviewed.',
        target: {
          type: 'CUSTOMER_SEGMENT',
          label: 'Quiet customers',
          estimatedCustomerCount: Math.max(report.metrics.customer.dormantCustomers.length, 0),
          segmentRule: { lastOrderBeforeDays: 7, lastOrderWithinDays: 30 },
        },
        offer: {
          campaignType: CampaignType.PROMO_CODE,
          discountType: 'fixed_amount',
          discountValue: 5,
          threshold: 30,
          suggestedDurationDays: 7,
          promoCode: 'BACK',
        },
        expectedImpact: {
          label: 'Conservative repeat lift',
          description: 'Expected to create a small number of repeat visits while keeping the offer limited to known customers.',
          confidence: report.metrics.customer.dormantCustomers.length > 0 ? 'MEDIUM' : 'LOW',
        },
        evidenceIds: [customerEvidence.id, salesEvidence.id],
        action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create reactivation draft' },
        draftPayload: {
          campaignType: CampaignType.PROMO_CODE,
          discountType: 'fixed_amount',
          discountValue: 5,
          thresholdAmount: 30,
          promoCode: promoCode('BACK'),
          customerEligibilityMode: CustomerEligibilityMode.SEGMENT_ONLY,
          segmentName: 'AI Quiet Customers',
          segmentRule: { lastOrderBeforeDays: 7, lastOrderWithinDays: 30 },
          durationDays: 7,
          bannerCopy: 'A small welcome-back offer.',
          staffMessage: 'Use this only for customers in the AI quiet-customer segment after manager review.',
          requiresManualCompletion: false,
        },
      },
      {
        id: 'rec_campaign_top_customer_reward',
        type: 'TOP_CUSTOMER_REWARD',
        priority: report.metrics.customer.topCustomers.length > 0 ? 'MEDIUM' : 'LOW',
        title: 'Reward high-value customers with a private offer',
        goal: 'Protect loyalty from the customers who already spend the most.',
        reason: report.metrics.customer.topCustomers.length > 0
          ? `${report.metrics.customer.topCustomers.length} top customer records are available for targeting.`
          : 'data_insufficient: Create the draft only after reviewing customer history.',
        target: {
          type: 'CUSTOMER_SEGMENT',
          label: 'High-value customers',
          estimatedCustomerCount: Math.max(report.metrics.customer.topCustomers.length, 0),
          segmentRule: { minOrderCount: 2 },
        },
        offer: {
          campaignType: CampaignType.PROMO_CODE,
          discountType: 'percentage',
          discountValue: 10,
          suggestedDurationDays: 10,
          promoCode: 'VIP',
        },
        expectedImpact: {
          label: 'Loyalty protection',
          description: 'Expected to encourage repeat visits from known customers without opening the discount to every guest.',
          confidence: report.metrics.customer.topCustomers.length > 0 ? 'MEDIUM' : 'LOW',
        },
        evidenceIds: [customerEvidence.id, salesEvidence.id],
        action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create VIP draft' },
        draftPayload: {
          campaignType: CampaignType.PROMO_CODE,
          discountType: 'percentage',
          discountValue: 10,
          thresholdAmount: null,
          promoCode: promoCode('VIP'),
          customerEligibilityMode: CustomerEligibilityMode.SEGMENT_ONLY,
          segmentName: 'AI High Value Customers',
          segmentRule: topCustomerRule(report),
          durationDays: 10,
          bannerCopy: 'A thank-you offer for regular guests.',
          staffMessage: 'Confirm the customer belongs to the VIP segment before sharing the code.',
          requiresManualCompletion: false,
        },
      },
      {
        id: 'rec_campaign_aov_threshold',
        type: 'AOV_THRESHOLD_PROMO',
        priority: report.metrics.sales.orderCount > 0 ? 'MEDIUM' : 'LOW',
        title: 'Lift average order value with a threshold discount',
        goal: 'Move baskets slightly above the current average order value.',
        reason: report.metrics.sales.orderCount > 0
          ? `Average order value is ${report.metrics.sales.averageOrderValue.toFixed(2)}, so a ${aovThreshold.toFixed(2)} threshold is conservative.`
          : 'data_insufficient: Use a threshold draft after confirming menu pricing.',
        target: { type: 'STORE', label: 'All customers' },
        offer: {
          campaignType: CampaignType.THRESHOLD_DISCOUNT,
          discountType: 'fixed_amount',
          discountValue: 5,
          threshold: aovThreshold,
          suggestedDurationDays: 7,
        },
        expectedImpact: {
          label: 'Basket-size lift',
          description: 'Expected to nudge guests to add one extra item while capping the discount value.',
          confidence: report.metrics.sales.orderCount > 0 ? 'MEDIUM' : 'LOW',
        },
        evidenceIds: [salesEvidence.id],
        action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create threshold draft' },
        draftPayload: {
          campaignType: CampaignType.THRESHOLD_DISCOUNT,
          discountType: 'fixed_amount',
          discountValue: 5,
          thresholdAmount: aovThreshold,
          customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS,
          durationDays: 7,
          bannerCopy: 'Save when your basket reaches the threshold.',
          staffMessage: 'Suggest an add-on when the order is close to the AI threshold.',
          requiresManualCompletion: false,
        },
      },
    ];

    const lowSeller = report.metrics.product.lowSellingProducts.find((product) => product.quantitySold === 0) ?? report.metrics.product.lowSellingProducts[0];
    if (lowSeller) {
      items.push({
        id: 'rec_campaign_low_selling_product',
        type: 'LOW_SELLING_PRODUCT_PROMO',
        priority: 'MEDIUM',
        title: `Test a product promo for ${lowSeller.name}`,
        goal: 'Move slow inventory or validate whether the item should stay on the menu.',
        reason: `${lowSeller.name} is one of the lowest-moving products in this range.`,
        target: { type: 'PRODUCT', label: lowSeller.name, productId: lowSeller.productId },
        offer: {
          campaignType: CampaignType.ITEM_DISCOUNT,
          discountType: 'percentage',
          discountValue: 15,
          suggestedDurationDays: 5,
          productId: lowSeller.productId,
        },
        expectedImpact: {
          label: 'Product movement test',
          description: 'Expected to produce a small signal on whether guests respond to this product.',
          confidence: 'MEDIUM',
        },
        evidenceIds: [productEvidence.id, salesEvidence.id],
        action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create product draft' },
        draftPayload: {
          campaignType: CampaignType.ITEM_DISCOUNT,
          discountType: 'percentage',
          discountValue: 15,
          thresholdAmount: null,
          productId: lowSeller.productId,
          customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS,
          durationDays: 5,
          bannerCopy: `Try ${lowSeller.name} today.`,
          staffMessage: `Offer ${lowSeller.name} when guests are deciding between add-ons.`,
          requiresManualCompletion: false,
        },
      });
    }

    items.push({
      id: 'rec_campaign_off_peak',
      type: 'OFF_PEAK_PROMO',
      priority: 'LOW',
      title: 'Prepare a low-traffic window offer',
      goal: 'Shift demand into quieter hours without changing the promotion engine.',
      reason: 'The current campaign engine does not enforce time windows, so the time window is saved as AI metadata for manager review.',
      target: { type: 'STORE', label: 'Off-peak guests' },
      offer: {
        campaignType: CampaignType.ORDER_DISCOUNT,
        discountType: 'percentage',
        discountValue: 10,
        suggestedDurationDays: 5,
        timeWindow: '14:00-17:00',
        requiresManualCompletion: true,
      },
      expectedImpact: {
        label: 'Traffic smoothing',
        description: 'Expected to help test quieter-hour demand; execution requires staff review because time windows are metadata only.',
        confidence: 'LOW',
      },
      evidenceIds: [salesEvidence.id],
      action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create off-peak draft' },
      draftPayload: {
        campaignType: CampaignType.ORDER_DISCOUNT,
        discountType: 'percentage',
        discountValue: 10,
        thresholdAmount: null,
        customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS,
        durationDays: 5,
        timeWindow: '14:00-17:00',
        bannerCopy: 'Quiet-hour special.',
        staffMessage: 'Use only during the AI suggested quiet window after manager confirmation.',
        requiresManualCompletion: true,
      },
    });

    if (report.metrics.kitchen.overdueTicketCount > 0 || report.metrics.kitchen.urgentTicketCount > 0) {
      items.push({
        id: 'rec_campaign_kitchen_load_balance',
        type: 'KITCHEN_LOAD_BALANCE',
        priority: 'HIGH',
        title: 'Avoid adding demand to overloaded kitchen stations',
        goal: 'Protect prep speed and avoid promoting complex items during kitchen pressure.',
        reason: 'Kitchen evidence shows overdue or urgent tickets, so this is an operational recommendation instead of an auto draft.',
        target: { type: 'KITCHEN_STATION', label: report.metrics.kitchen.topOverdueStations[0]?.name ?? 'Kitchen stations', stationId: report.metrics.kitchen.topOverdueStations[0]?.stationId },
        offer: { campaignType: CampaignType.ORDER_DISCOUNT, suggestedDurationDays: 0, requiresManualCompletion: true },
        expectedImpact: {
          label: 'Service quality protection',
          description: 'Expected to reduce operational risk by avoiding demand spikes on constrained prep areas.',
          confidence: 'MEDIUM',
        },
        evidenceIds: [kitchenEvidence.id],
        action: { kind: 'NONE', label: 'Review kitchen load' },
      });
    }

    return items;
  }
}

class EvidenceIndex {
  constructor(private readonly evidence: BusinessDailyEvidence[]) {}

  first(type: BusinessDailyEvidence['type']) {
    return this.evidence.find((item) => item.type === type);
  }
}

function roundToNiceThreshold(value: number) {
  return Math.max(10, Math.ceil(value / 5) * 5);
}

function promoCode(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

function topCustomerRule(report: BusinessDailyReport) {
  const top = report.metrics.customer.topCustomers[0];
  if (!top) return { minOrderCount: 2 };
  const rule: Record<string, number> = {
    minOrderCount: Math.max(1, Math.min(2, top.orderCount)),
  };
  rule.minTotalSpend = Math.max(1, Math.floor(top.totalSpend * 0.5));
  return rule;
}
