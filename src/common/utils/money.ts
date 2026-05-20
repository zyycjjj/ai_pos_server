import { Decimal } from '@prisma/client/runtime/library';

export function toMoney(value: Decimal | number | string) {
  return new Decimal(value).toDecimalPlaces(2);
}

export function toMoneyNumber(value: Decimal | number | string) {
  return Number(toMoney(value).toFixed(2));
}

export function multiplyMoney(value: Decimal | number | string, quantity: number) {
  return toMoney(value).mul(quantity).toDecimalPlaces(2);
}
