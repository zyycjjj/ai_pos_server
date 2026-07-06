import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';

import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  it('creates an order with calculated line totals and grand total', async () => {
    const createdAt = new Date('2026-05-20T05:31:25.329Z');
    const products = [
      {
        id: 'espresso',
        name: 'Espresso',
        category: 'Coffee',
        price: new Decimal('3.50'),
        currency: 'USD',
        isActive: true,
        modifierGroups: [],
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'croissant',
        name: 'Croissant',
        category: 'Bakery',
        price: new Decimal('4.25'),
        currency: 'USD',
        isActive: true,
        modifierGroups: [],
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const prisma = {
      product: {
        findMany: async () => products,
      },
      $transaction: async (callback: any) => callback(prisma),
      order: {
        count: async () => 0,
        create: async ({ data }: any) => ({
          id: 'order-1',
          orderNumber: data.orderNumber,
          pickupNumber: data.pickupNumber,
          status: data.status,
          printStatus: 'NOT_PRINTED',
          paymentMethod: data.paymentMethod,
          currency: data.currency,
          subtotal: data.subtotal,
          adjustment: data.adjustment,
          adjustmentType: data.adjustmentType ?? null,
          adjustmentValue: data.adjustmentValue ?? null,
          tax: data.tax,
          tip: data.tip,
          total: data.total,
          cashReceived: data.cashReceived ?? null,
          changeDue: data.changeDue ?? null,
          paidAt: data.paidAt ?? null,
          printedAt: null,
          createdAt,
          updatedAt: createdAt,
          payments: data.payments.create.map((payment: any, index: number) => ({
            id: `payment-${index}`,
            orderId: 'order-1',
            createdAt,
            ...payment,
          })),
          items: data.items.create.map((item: any, index: number) => ({
            id: `item-${index}`,
            createdAt,
            orderId: 'order-1',
            product: products.find((product) => product.id === item.productId),
            ...item,
          })),
        }),
      },
    };

    const service = new CheckoutService(prisma as any);
    const order = await service.createOrder({
      items: [
        { productId: 'espresso', quantity: 2 },
        { productId: 'croissant', quantity: 1 },
      ],
      tax: 0.93,
      payments: [{ method: 'CARD', amount: 12.18 }],
      currency: 'USD',
    });

    assert.equal(order.subtotal, 11.25);
    assert.equal(order.tax, 0.93);
    assert.equal(order.total, 12.18);
    assert.equal(order.status, 'PAID');
    assert.equal(order.paymentMethod, 'CARD');
    assert.equal(order.pickupNumber, '0001');
    assert.equal(order.items[0].lineTotal, 7);
    assert.equal(order.items[1].lineTotal, 4.25);
    assert.match(order.orderNumber, /^POS-\d{14}-[A-Z0-9]{4}$/);
  });

  it('applies selected modifier price deltas to line totals', async () => {
    const createdAt = new Date('2026-05-20T05:31:25.329Z');
    const products = [
      {
        id: 'milk-tea',
        name: 'Milk Tea',
        category: 'Tea',
        price: new Decimal('6.50'),
        currency: 'USD',
        isActive: true,
        modifierGroups: [
          {
            id: 'sweetness',
            productId: 'milk-tea',
            name: 'Sweetness',
            required: true,
            multiSelect: false,
            minSelect: 1,
            maxSelect: 1,
            status: 'ACTIVE',
            displayOrder: 1,
            createdAt,
            updatedAt: createdAt,
            options: [
              {
                id: 'sweet-70',
                groupId: 'sweetness',
                name: '70%',
                priceDelta: new Decimal('2.00'),
                status: 'ACTIVE',
                displayOrder: 1,
                createdAt,
                updatedAt: createdAt,
              },
            ],
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const prisma = {
      product: {
        findMany: async () => products,
      },
      $transaction: async (callback: any) => callback(prisma),
      order: {
        count: async () => 0,
        create: async ({ data }: any) => ({
          id: 'order-1',
          orderNumber: data.orderNumber,
          pickupNumber: data.pickupNumber,
          status: data.status,
          printStatus: 'NOT_PRINTED',
          paymentMethod: data.paymentMethod,
          currency: data.currency,
          subtotal: data.subtotal,
          adjustment: data.adjustment,
          adjustmentType: data.adjustmentType ?? null,
          adjustmentValue: data.adjustmentValue ?? null,
          tax: data.tax,
          tip: data.tip,
          total: data.total,
          cashReceived: data.cashReceived ?? null,
          changeDue: data.changeDue ?? null,
          paidAt: data.paidAt ?? null,
          printedAt: null,
          createdAt,
          updatedAt: createdAt,
          payments: data.payments.create.map((payment: any, index: number) => ({
            id: `payment-${index}`,
            orderId: 'order-1',
            createdAt,
            ...payment,
          })),
          items: data.items.create.map((item: any, index: number) => ({
            id: `item-${index}`,
            createdAt,
            orderId: 'order-1',
            product: products.find((product) => product.id === item.productId),
            ...item,
          })),
        }),
      },
    };

    const service = new CheckoutService(prisma as any);
    const order = await service.createOrder({
      items: [
        {
          productId: 'milk-tea',
          quantity: 2,
          modifiers: [{ groupId: 'sweetness', optionIds: ['sweet-70'] }],
        },
      ],
      tax: 0,
      payments: [{ method: 'CARD', amount: 17 }],
      currency: 'USD',
    });

    assert.equal(order.items[0].unitPrice, 8.5);
    assert.equal(order.items[0].lineTotal, 17);
    assert.equal(order.subtotal, 17);
    assert.deepEqual(order.items[0].modifiers, [
      { groupId: 'sweetness', groupName: 'Sweetness', optionId: 'sweet-70', optionName: '70%', priceDelta: 2 },
    ]);
  });

  it('rejects sold out modifier options', async () => {
    const createdAt = new Date('2026-05-20T05:31:25.329Z');
    const products = [
      {
        id: 'milk-tea',
        name: 'Milk Tea',
        category: 'Tea',
        price: new Decimal('6.50'),
        currency: 'USD',
        isActive: true,
        modifierGroups: [
          {
            id: 'toppings',
            productId: 'milk-tea',
            name: 'Toppings',
            required: false,
            multiSelect: true,
            minSelect: 0,
            maxSelect: 3,
            status: 'ACTIVE',
            displayOrder: 1,
            createdAt,
            updatedAt: createdAt,
            options: [
              {
                id: 'pearl',
                groupId: 'toppings',
                name: 'Pearl',
                priceDelta: new Decimal('0.75'),
                status: 'SOLD_OUT',
                displayOrder: 1,
                createdAt,
                updatedAt: createdAt,
              },
            ],
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const prisma = {
      product: {
        findMany: async () => products,
      },
    };

    const service = new CheckoutService(prisma as any);
    await assert.rejects(
      () =>
        service.createOrder({
          items: [{ productId: 'milk-tea', quantity: 1, modifiers: [{ groupId: 'toppings', optionIds: ['pearl'] }] }],
          tax: 0,
          payments: [{ method: 'CARD', amount: 7.25 }],
          currency: 'USD',
        }),
      /Modifier option is not available: Pearl/,
    );
  });

  it('applies order adjustments and cash change', async () => {
    const createdAt = new Date('2026-05-20T05:31:25.329Z');
    const products = [
      {
        id: 'tea',
        name: 'Tea',
        category: 'Tea',
        price: new Decimal('10.00'),
        currency: 'USD',
        isActive: true,
        modifierGroups: [],
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const prisma = {
      product: {
        findMany: async () => products,
      },
      $transaction: async (callback: any) => callback(prisma),
      order: {
        count: async () => 4,
        create: async ({ data }: any) => ({
          id: 'order-1',
          orderNumber: data.orderNumber,
          pickupNumber: data.pickupNumber,
          status: data.status,
          printStatus: 'NOT_PRINTED',
          paymentMethod: data.paymentMethod,
          currency: data.currency,
          subtotal: data.subtotal,
          adjustment: data.adjustment,
          adjustmentType: data.adjustmentType ?? null,
          adjustmentValue: data.adjustmentValue ?? null,
          tax: data.tax,
          tip: data.tip,
          total: data.total,
          cashReceived: data.cashReceived ?? null,
          changeDue: data.changeDue ?? null,
          paidAt: data.paidAt ?? null,
          printedAt: null,
          createdAt,
          updatedAt: createdAt,
          payments: data.payments.create.map((payment: any, index: number) => ({
            id: `payment-${index}`,
            orderId: 'order-1',
            createdAt,
            ...payment,
          })),
          items: data.items.create.map((item: any, index: number) => ({
            id: `item-${index}`,
            createdAt,
            orderId: 'order-1',
            product: products.find((product) => product.id === item.productId),
            ...item,
          })),
        }),
      },
    };

    const service = new CheckoutService(prisma as any);
    const order = await service.createOrder({
      items: [{ productId: 'tea', quantity: 2 }],
      adjustment: { type: 'discount', value: 90 },
      tax: 0,
      payments: [{ method: 'CASH', amount: 18, amountReceived: 20 }],
      currency: 'USD',
    });

    assert.equal(order.subtotal, 20);
    assert.equal(order.adjustment, 2);
    assert.equal(order.adjustmentType, 'discount');
    assert.equal(order.adjustmentValue, 90);
    assert.equal(order.total, 18);
    assert.equal(order.cashReceived, 20);
    assert.equal(order.changeDue, 2);
    assert.equal(order.pickupNumber, '0005');
  });

  it('applies fixed reduction and price override adjustments', async () => {
    const createdAt = new Date('2026-05-20T05:31:25.329Z');
    const products = [
      {
        id: 'tea',
        name: 'Tea',
        category: 'Tea',
        price: new Decimal('50.00'),
        currency: 'USD',
        isActive: true,
        modifierGroups: [],
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const createPrisma = () => ({
      product: {
        findMany: async () => products,
      },
      $transaction: async (callback: any) => callback(createPrisma()),
      order: {
        count: async () => 0,
        create: async ({ data }: any) => ({
          id: 'order-1',
          orderNumber: data.orderNumber,
          pickupNumber: data.pickupNumber,
          status: data.status,
          printStatus: 'NOT_PRINTED',
          paymentMethod: data.paymentMethod,
          currency: data.currency,
          subtotal: data.subtotal,
          adjustment: data.adjustment,
          adjustmentType: data.adjustmentType ?? null,
          adjustmentValue: data.adjustmentValue ?? null,
          tax: data.tax,
          tip: data.tip,
          total: data.total,
          cashReceived: data.cashReceived ?? null,
          changeDue: data.changeDue ?? null,
          paidAt: data.paidAt ?? null,
          printedAt: null,
          createdAt,
          updatedAt: createdAt,
          payments: data.payments.create.map((payment: any, index: number) => ({
            id: `payment-${index}`,
            orderId: 'order-1',
            createdAt,
            ...payment,
          })),
          items: data.items.create.map((item: any, index: number) => ({
            id: `item-${index}`,
            createdAt,
            orderId: 'order-1',
            product: products.find((product) => product.id === item.productId),
            ...item,
          })),
        }),
      },
    });

    const fixedReductionOrder = await new CheckoutService(createPrisma() as any).createOrder({
      items: [{ productId: 'tea', quantity: 1 }],
      adjustment: { type: 'fixed_reduction', value: 20 },
      tax: 0,
      payments: [{ method: 'CARD', amount: 30 }],
      currency: 'USD',
    });
    const overrideOrder = await new CheckoutService(createPrisma() as any).createOrder({
      items: [{ productId: 'tea', quantity: 1 }],
      adjustment: { type: 'price_override', value: 35 },
      tax: 0,
      payments: [{ method: 'MANUAL', amount: 35 }],
      currency: 'USD',
    });

    assert.equal(fixedReductionOrder.adjustment, 20);
    assert.equal(fixedReductionOrder.total, 30);
    assert.equal(overrideOrder.adjustment, 15);
    assert.equal(overrideOrder.total, 35);
    assert.equal(overrideOrder.paymentMethod, 'MANUAL');
  });

  it('accepts split cash and card payments', async () => {
    const createdAt = new Date('2026-05-20T05:31:25.329Z');
    const products = [
      {
        id: 'tea',
        name: 'Tea',
        category: 'Tea',
        price: new Decimal('10.00'),
        currency: 'USD',
        isActive: true,
        modifierGroups: [],
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const prisma = {
      product: {
        findMany: async () => products,
      },
      $transaction: async (callback: any) => callback(prisma),
      order: {
        count: async () => 0,
        create: async ({ data }: any) => ({
          id: 'order-1',
          orderNumber: data.orderNumber,
          pickupNumber: data.pickupNumber,
          status: data.status,
          printStatus: 'NOT_PRINTED',
          paymentMethod: data.paymentMethod,
          currency: data.currency,
          subtotal: data.subtotal,
          adjustment: data.adjustment,
          adjustmentType: data.adjustmentType ?? null,
          adjustmentValue: data.adjustmentValue ?? null,
          tax: data.tax,
          tip: data.tip,
          total: data.total,
          cashReceived: data.cashReceived ?? null,
          changeDue: data.changeDue ?? null,
          paidAt: data.paidAt ?? null,
          printedAt: null,
          createdAt,
          updatedAt: createdAt,
          payments: data.payments.create.map((payment: any, index: number) => ({
            id: `payment-${index}`,
            orderId: 'order-1',
            createdAt,
            ...payment,
          })),
          items: data.items.create.map((item: any, index: number) => ({
            id: `item-${index}`,
            createdAt,
            orderId: 'order-1',
            product: products.find((product) => product.id === item.productId),
            ...item,
          })),
        }),
      },
    };

    const order = await new CheckoutService(prisma as any).createOrder({
      items: [{ productId: 'tea', quantity: 10 }],
      tax: 0,
      payments: [
        { method: 'CASH', amount: 30, amountReceived: 50 },
        { method: 'CARD', amount: 70 },
      ],
      currency: 'USD',
    });

    assert.equal(order.total, 100);
    assert.equal(order.paymentMethod, 'MANUAL');
    assert.equal(order.cashReceived, 50);
    assert.equal(order.changeDue, 20);
    assert.deepEqual(
      order.payments.map((payment) => ({ method: payment.method, amount: payment.amount, amountReceived: payment.amountReceived, changeDue: payment.changeDue })),
      [
        { method: 'CASH', amount: 30, amountReceived: 50, changeDue: 20 },
        { method: 'CARD', amount: 70, amountReceived: null, changeDue: null },
      ],
    );
  });
});
