import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { CustomerStatus, LoyaltyPointLedgerType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { CustomersService } from './customers.service';
import { InvalidCustomerPhoneError, normalizePhone } from './domain/phone';

describe('customer phone normalization', () => {
  it('keeps digits and optional leading country code', () => {
    assert.equal(normalizePhone(' +1 (415) 555-0101 '), '+14155550101');
    assert.equal(normalizePhone('415-555-0101'), '4155550101');
  });

  it('keeps domain validation free of transport dependencies', () => {
    assert.throws(() => normalizePhone('123'), InvalidCustomerPhoneError);
    const service = new CustomersService({} as never);
    assert.throws(() => service.normalizePhone('123'), BadRequestException);
  });
});

describe('CustomersService loyalty foundation', () => {
  it('creates and looks up customers by normalized phone per store', async () => {
    const harness = createHarness('store-a');
    const service = harness.service;
    const customer = await service.createCustomer({ phone: '(415) 555-0101', name: 'Ava' });

    assert.equal(customer.normalizedPhone, '4155550101');
    assert.equal((await service.lookupByPhone('4155550101'))?.id, customer.id);
    await assert.rejects(() => service.createCustomer({ phone: '415 555 0101' }), /already exists/);

    const otherStore = createHarness('store-b');
    const samePhone = await otherStore.service.createCustomer({ phone: '415 555 0101', name: 'Other' });
    assert.notEqual(samePhone.id, customer.id);
  });

  it('records paid orders and refund point adjustments without negative balances', async () => {
    const harness = createHarness('store-a');
    const customer = await harness.service.quickCreate({ phone: '+1 650 555 0000', name: 'Mia' });
    const tx = harness.prisma as any;
    const paidAt = new Date('2026-07-20T00:00:00.000Z');

    await harness.service.recordPaidOrder(tx, {
      storeId: 'store-a',
      customerId: customer.id,
      orderId: 'order-1',
      orderTotal: new Decimal(12.75),
      paidAt,
      createdByUserId: 'cashier-1',
    });

    assert.equal(harness.customers.get(customer.id)?.orderCount, 1);
    assert.equal(Number(harness.customers.get(customer.id)?.totalSpend), 12.75);
    assert.equal(harness.customers.get(customer.id)?.pointsBalance, 12);
    assert.equal(harness.orders.get('order-1')?.loyaltyPointsEarned, 12);
    assert.equal(harness.ledgers[0].type, LoyaltyPointLedgerType.EARN);

    await harness.service.recordRefundAdjustment(tx, {
      storeId: 'store-a',
      customerId: customer.id,
      orderId: 'order-1',
      refundAmount: new Decimal(20),
      createdByUserId: 'manager-1',
    });

    assert.equal(Number(harness.customers.get(customer.id)?.totalSpend), 0);
    assert.equal(harness.customers.get(customer.id)?.pointsBalance, 0);
    assert.equal(harness.ledgers[1].points, -12);
    assert.equal(harness.ledgers[1].type, LoyaltyPointLedgerType.REFUND_ADJUST);
  });
});

let customerSequence = 0;

function createHarness(storeId: string) {
  const customers = new Map<string, any>();
  const orders = new Map<string, any>([
    ['order-1', { id: 'order-1', loyaltyPointsEarned: 0, loyaltyPointsBalanceAfter: null }],
  ]);
  const ledgers: any[] = [];
  const prisma = {
    customer: {
      count: async ({ where }: any) => Array.from(customers.values()).filter((customer) => customer.storeId === where.storeId).length,
      findMany: async ({ where }: any) => Array.from(customers.values()).filter((customer) => customer.storeId === where.storeId),
      findFirst: async ({ where }: any) =>
        Array.from(customers.values()).find((customer) => customer.storeId === where.storeId && (!where.id || customer.id === where.id) && (!where.normalizedPhone || customer.normalizedPhone === where.normalizedPhone)) ?? null,
      findUnique: async ({ where }: any) =>
        Array.from(customers.values()).find((customer) => customer.storeId === where.storeId_normalizedPhone.storeId && customer.normalizedPhone === where.storeId_normalizedPhone.normalizedPhone) ?? null,
      create: async ({ data }: any) => {
        const created = customer({ id: `customer-${++customerSequence}`, ...data });
        customers.set(created.id, created);
        return created;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = Array.from(customers.values()).find((customer) => customer.storeId === where.storeId_normalizedPhone.storeId && customer.normalizedPhone === where.storeId_normalizedPhone.normalizedPhone);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = customer({ id: `customer-${++customerSequence}`, ...create });
        customers.set(created.id, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const current = customers.get(where.id);
        Object.assign(current, materializeUpdate(current, data));
        return current;
      },
    },
    order: {
      update: async ({ where, data }: any) => {
        const current = orders.get(where.id) ?? { id: where.id };
        Object.assign(current, data);
        orders.set(where.id, current);
        return current;
      },
    },
    loyaltyPointLedger: {
      create: async ({ data }: any) => {
        ledgers.push({ id: `ledger-${ledgers.length + 1}`, createdAt: new Date(), ...data });
        return ledgers.at(-1);
      },
    },
  };

  return {
    service: new CustomersService(prisma as any, { getStoreId: () => storeId } as any),
    prisma,
    customers,
    orders,
    ledgers,
  };
}

function customer(input: any) {
  const now = new Date();
  return {
    name: null,
    note: null,
    tags: [],
    status: CustomerStatus.ACTIVE,
    firstOrderAt: null,
    lastOrderAt: null,
    orderCount: 0,
    totalSpend: new Decimal(0),
    pointsBalance: 0,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function materializeUpdate(current: any, data: any) {
  return {
    ...data,
    orderCount: data.orderCount?.increment ? current.orderCount + data.orderCount.increment : data.orderCount ?? current.orderCount,
  };
}
