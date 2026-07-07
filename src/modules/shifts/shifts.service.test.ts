import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CashMovementReferenceType, CashMovementType, PaymentMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  it('calculates expected cash from opening, sales, refunds, cash in, and cash out', () => {
    const service = new ShiftsService({} as any);
    const summary = (service as any).calculateSummary([
      { type: CashMovementType.OPENING, amount: new Decimal('200.00') },
      { type: CashMovementType.SALE, amount: new Decimal('500.00') },
      { type: CashMovementType.REFUND, amount: new Decimal('30.00') },
      { type: CashMovementType.CASH_IN, amount: new Decimal('50.00') },
      { type: CashMovementType.CASH_OUT, amount: new Decimal('100.00') },
    ]);

    assert.equal(summary.expectedCash.toFixed(2), '620.00');
  });

  it('records only cash payment lines as idempotent sale movements', async () => {
    const upserts: any[] = [];
    const tx = {
      cashMovement: {
        upsert: async (input: any) => {
          upserts.push(input);
        },
      },
    };
    const service = new ShiftsService({} as any);

    await service.recordCashSaleMovements(tx as any, {
      storeId: 'store-1',
      shiftId: 'shift-1',
      orderId: 'order-1',
      createdByUserId: 'cashier-1',
      payments: [
        { id: 'payment-cash', method: PaymentMethod.CASH, amount: new Decimal('30.00') },
        { id: 'payment-card', method: PaymentMethod.CARD, amount: new Decimal('70.00') },
      ],
    });

    assert.equal(upserts.length, 1);
    assert.deepEqual(upserts[0].where.storeId_type_referenceType_referenceId, {
      storeId: 'store-1',
      type: CashMovementType.SALE,
      referenceType: CashMovementReferenceType.ORDER_PAYMENT,
      referenceId: 'payment-cash',
    });
    assert.equal(upserts[0].create.amount.toFixed(2), '30.00');
  });
});
