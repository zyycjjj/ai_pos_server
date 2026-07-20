import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { toMoney } from '@/common/utils/money';

import type { CreateOrderDto } from '../dto/create-order.dto';

export type PaymentValidationResult = {
  lines: Array<{
    method: PaymentMethod;
    amount: Decimal;
    amountReceived?: Decimal;
    changeDue?: Decimal;
  }>;
  summaryMethod: PaymentMethod;
  cashReceived: Decimal;
  changeDue: Decimal;
};

export function validatePaymentLines(payments: CreateOrderDto['payments'], total: Decimal): PaymentValidationResult {
  // Payment validation stays server-side so split/mixed payments cannot settle an order unless persisted lines exactly match the trusted total.
  if (!payments || payments.length === 0) {
    throw new BadRequestException('At least one payment line is required.');
  }

  const lines = payments.map((payment) => {
    const method = payment.method as PaymentMethod;
    const amount = toMoney(payment.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    if (method !== PaymentMethod.CASH) {
      return {
        method,
        amount,
        amountReceived: undefined,
        changeDue: undefined,
      };
    }

    const amountReceived = toMoney(payment.amountReceived ?? 0);
    if (amountReceived.lessThan(amount)) {
      throw new BadRequestException('Cash received is less than cash payment amount.');
    }

    return {
      method,
      amount,
      amountReceived,
      changeDue: amountReceived.minus(amount).toDecimalPlaces(2),
    };
  });

  const paidAmount = lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toDecimalPlaces(2);
  if (!paidAmount.equals(total)) {
    throw new BadRequestException('Payment lines must equal order total.');
  }

  const cashLines = lines.filter((line) => line.method === PaymentMethod.CASH);
  return {
    lines,
    summaryMethod: lines.length === 1 ? lines[0].method : PaymentMethod.MANUAL,
    cashReceived: cashLines.reduce((sum, line) => sum.plus(line.amountReceived ?? 0), new Decimal(0)).toDecimalPlaces(2),
    changeDue: cashLines.reduce((sum, line) => sum.plus(line.changeDue ?? 0), new Decimal(0)).toDecimalPlaces(2),
  };
}
