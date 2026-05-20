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
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const prisma = {
      product: {
        findMany: async () => products,
      },
      order: {
        create: async ({ data }: any) => ({
          id: 'order-1',
          orderNumber: data.orderNumber,
          status: 'OPEN',
          currency: data.currency,
          subtotal: data.subtotal,
          tax: data.tax,
          tip: data.tip,
          total: data.total,
          paidAt: null,
          createdAt,
          updatedAt: createdAt,
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
      currency: 'USD',
    });

    assert.equal(order.subtotal, 11.25);
    assert.equal(order.tax, 0.93);
    assert.equal(order.total, 12.18);
    assert.equal(order.items[0].lineTotal, 7);
    assert.equal(order.items[1].lineTotal, 4.25);
    assert.match(order.orderNumber, /^POS-\d{14}-[A-Z0-9]{4}$/);
  });
});
