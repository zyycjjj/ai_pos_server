import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

import { toMoney } from '@/common/utils/money';

import type { CreateOrderDto } from '../dto/create-order.dto';

export type CheckoutPricingInput = Pick<CreateOrderDto, 'adjustment' | 'tax' | 'taxRate' | 'serviceCharge' | 'serviceChargeRate' | 'tip'> & {
  subtotal: Decimal;
  promotionDiscountAmount: Decimal;
};

export type CheckoutPricingBreakdown = {
  adjustment: Decimal;
  promotionDiscountAmount: Decimal;
  manualDiscountAmount: Decimal;
  totalDiscountAmount: Decimal;
  adjustmentType?: string;
  adjustmentValue?: Decimal;
  discountReason?: string;
  taxRate: Decimal;
  tax: Decimal;
  serviceChargeRate: Decimal;
  serviceCharge: Decimal;
  tip: Decimal;
  total: Decimal;
};

export function calculateManualAdjustment(subtotal: Decimal, adjustment: CreateOrderDto['adjustment']) {
  if (!adjustment) {
    return { amount: new Decimal(0) };
  }

  const value = toMoney(adjustment.value);
  let amount: Decimal;
  switch (adjustment.type) {
    case 'discount':
    case 'percentage_discount':
      if (value.lessThan(0) || value.greaterThan(100)) {
        throw new BadRequestException('Discount must be between 0 and 100.');
      }
      amount = subtotal.mul(value).div(100).toDecimalPlaces(2);
      break;
    case 'fixed_reduction':
      amount = value.toDecimalPlaces(2);
      break;
    case 'price_override':
      amount = subtotal.minus(value).toDecimalPlaces(2);
      break;
    default:
      amount = new Decimal(0);
  }

  if (amount.lessThan(0)) {
    throw new BadRequestException('Adjustment cannot increase the order total.');
  }
  if (amount.greaterThan(subtotal)) {
    throw new BadRequestException('Adjustment cannot exceed subtotal.');
  }

  return { amount: amount.toDecimalPlaces(2) };
}

export function buildCheckoutPricing(input: CheckoutPricingInput): CheckoutPricingBreakdown {
  // Trusted checkout boundary: the server combines catalog prices, manual discounts, promotions, tax, service charge, and tip without trusting client totals.
  const manualAdjustment = calculateManualAdjustment(input.subtotal, input.adjustment);
  const totalDiscountAmount = Decimal.min(input.subtotal, manualAdjustment.amount.plus(input.promotionDiscountAmount)).toDecimalPlaces(2);
  const discountedSubtotal = input.subtotal.minus(totalDiscountAmount).toDecimalPlaces(2);
  const taxRate = toMoney(input.taxRate ?? 0);
  const serviceChargeRate = toMoney(input.serviceChargeRate ?? 0);
  const tax = input.tax === undefined ? discountedSubtotal.mul(taxRate).div(100).toDecimalPlaces(2) : toMoney(input.tax);
  const serviceCharge = input.serviceCharge === undefined ? discountedSubtotal.mul(serviceChargeRate).div(100).toDecimalPlaces(2) : toMoney(input.serviceCharge);
  const tip = toMoney(input.tip ?? 0);
  const total = discountedSubtotal.plus(tax).plus(serviceCharge).plus(tip).toDecimalPlaces(2);

  return {
    adjustment: totalDiscountAmount,
    promotionDiscountAmount: input.promotionDiscountAmount,
    manualDiscountAmount: manualAdjustment.amount,
    totalDiscountAmount,
    adjustmentType: input.adjustment?.type,
    adjustmentValue: input.adjustment ? toMoney(input.adjustment.value) : undefined,
    discountReason: input.adjustment?.reason,
    taxRate,
    tax,
    serviceChargeRate,
    serviceCharge,
    tip,
    total,
  };
}
