import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';

import { TablesService } from './tables.service';

const createdAt = new Date('2026-07-20T00:00:00.000Z');
const product = {
  id: 'product-tea',
  storeId: 'test-store',
  name: 'Tea',
  description: null,
  categoryId: null,
  category: 'Drinks',
  price: new Decimal('10.00'),
  currency: 'USD',
  isActive: true,
  availabilityStatus: 'AVAILABLE',
  kitchenStationId: null,
  createdAt,
  updatedAt: createdAt,
};

function orderItem(id: string, quantity: number, unitPrice = '10.00') {
  const price = new Decimal(unitPrice);
  return {
    id,
    orderId: 'order-source',
    productId: product.id,
    product,
    productNameSnapshot: product.name,
    productCategorySnapshot: product.category,
    quantity,
    unitPrice: price,
    lineTotal: price.mul(quantity).toDecimalPlaces(2),
    modifiers: [],
    createdAt,
    refundItems: [],
  };
}

function order(id: string, tableId: string, status = 'OPEN', items = [orderItem(`${id}-item`, 1)]) {
  const subtotal = items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0));
  return {
    id,
    storeId: 'test-store',
    orderNumber: `POS-${id}`,
    pickupNumber: '0001',
    orderType: 'DINE_IN',
    tableId,
    guestCount: 2,
    status,
    printStatus: 'NOT_PRINTED',
    paymentMethod: null,
    currency: 'USD',
    subtotal,
    adjustment: new Decimal(0),
    promotionDiscountAmount: new Decimal(0),
    manualDiscountAmount: new Decimal(0),
    totalDiscountAmount: new Decimal(0),
    appliedPromotions: [],
    adjustmentType: null,
    adjustmentValue: null,
    discountReason: null,
    taxRate: new Decimal(0),
    tax: new Decimal(0),
    serviceChargeRate: new Decimal(0),
    serviceCharge: new Decimal(0),
    tip: new Decimal(0),
    total: subtotal,
    cashReceived: null,
    changeDue: null,
    paidAt: null,
    printedAt: null,
    heldAt: null,
    resumedAt: null,
    openedAt: createdAt,
    closedAt: null,
    createdAt,
    updatedAt: createdAt,
    items,
    payments: [],
    refunds: [],
    auditLogs: [],
    kitchenTickets: [],
  };
}

function table(id: string, name: string, status: string, currentOrder: ReturnType<typeof order> | null = null) {
  return {
    id,
    storeId: 'test-store',
    areaId: 'area-1',
    area: { id: 'area-1', storeId: 'test-store', name: 'Main', sortOrder: 0, status: 'ACTIVE', createdAt, updatedAt: createdAt },
    name,
    seats: 2,
    status,
    sortOrder: 0,
    currentOrderId: currentOrder?.id ?? null,
    currentOrder,
    createdAt,
    updatedAt: createdAt,
  };
}

function createHarness(options: { targetStatus?: string; sourceOrderStatus?: string; targetOrderStatus?: string } = {}) {
  const sourceOrder = order('order-source', 'table-source', options.sourceOrderStatus ?? 'OPEN', [orderItem('item-1', 2), orderItem('item-2', 1, '5.00')]);
  const targetOrder = order('order-target', 'table-target', options.targetOrderStatus ?? 'OPEN', [orderItem('target-item-1', 1, '7.00')]);
  const tables = new Map([
    ['table-source', table('table-source', 'A1', 'OCCUPIED', sourceOrder)],
    ['table-target', table('table-target', 'A2', options.targetStatus ?? 'AVAILABLE', options.targetStatus === 'OCCUPIED' ? targetOrder : null)],
  ]);
  const orders = new Map([
    [sourceOrder.id, sourceOrder],
    [targetOrder.id, targetOrder],
  ]);
  const auditLogs: unknown[] = [];

  const prisma = {
    diningTable: {
      findFirst: async ({ where }: any) => {
        const found = tables.get(where.id);
        if (!found || found.storeId !== where.storeId) return null;
        return found;
      },
      update: async ({ where, data }: any) => {
        const current = tables.get(where.id);
        if (!current) throw new Error('table not found');
        const next = { ...current, ...data, currentOrder: data.currentOrderId === null ? null : current.currentOrder };
        if (data.currentOrderId) {
          next.currentOrder = orders.get(data.currentOrderId) ?? null;
        }
        tables.set(where.id, next);
        return next;
      },
    },
    order: {
      count: async () => 1,
      update: async ({ where, data }: any) => {
        const current = orders.get(where.id);
        if (!current) throw new Error('order not found');
        const createdItems = data.items?.create ?? [];
        const next = {
          ...current,
          ...data,
          items: [...current.items, ...createdItems.map((item: any, index: number) => ({ id: `created-${where.id}-${index}`, orderId: where.id, product, createdAt, refundItems: [], ...item }))],
          updatedAt: createdAt,
        };
        delete (next as any).items.create;
        orders.set(where.id, next);
        return next;
      },
      create: async ({ data }: any) => {
        const created = order('order-split', data.tableId, data.status, data.items.create.map((item: any, index: number) => ({ id: `split-item-${index}`, orderId: 'order-split', product, createdAt, refundItems: [], ...item })));
        Object.assign(created, data, { id: 'order-split', orderNumber: data.orderNumber, pickupNumber: data.pickupNumber, items: created.items });
        orders.set(created.id, created);
        return created;
      },
    },
    orderItem: {
      update: async ({ where, data }: any) => {
        for (const existingOrder of orders.values()) {
          const item = existingOrder.items.find((candidate) => candidate.id === where.id);
          if (item) Object.assign(item, data);
        }
      },
      delete: async ({ where }: any) => {
        for (const existingOrder of orders.values()) {
          existingOrder.items = existingOrder.items.filter((item) => item.id !== where.id);
        }
      },
    },
    orderAuditLog: {
      create: async ({ data }: any) => auditLogs.push(data),
    },
    $transaction: async (callback: any) => callback(prisma),
  };

  return {
    service: new TablesService(prisma as any, {} as any, { createAutoJobsForOrder: async () => undefined } as any, { generateTicketsForOrder: async () => [] } as any, {
      resolveOrderCustomer: async () => null,
      recordPaidOrder: async () => ({ pointsEarned: 0, balanceAfter: null }),
    } as any),
    tables,
    orders,
    auditLogs,
  };
}

describe('TablesService table operations', () => {
  it('transfers an occupied table order to an available table atomically', async () => {
    const { service, tables, orders, auditLogs } = createHarness();

    await service.transferTable('table-source', { targetTableId: 'table-target' }, { id: 'cashier-1', email: 'c@test.dev', name: 'Cashier', storeId: 'test-store', role: 'CASHIER' });

    assert.equal(tables.get('table-source')?.status, 'AVAILABLE');
    assert.equal(tables.get('table-source')?.currentOrderId, null);
    assert.equal(tables.get('table-target')?.status, 'OCCUPIED');
    assert.equal(tables.get('table-target')?.currentOrderId, 'order-source');
    assert.equal(orders.get('order-source')?.tableId, 'table-target');
    assert.equal(auditLogs.length, 1);
  });

  it('rejects transfer to occupied, dirty, or inactive tables', async () => {
    for (const targetStatus of ['OCCUPIED', 'DIRTY', 'INACTIVE']) {
      const { service } = createHarness({ targetStatus });
      await assert.rejects(() => service.transferTable('table-source', { targetTableId: 'table-target' }), /Target table must be available or reserved/);
    }
  });

  it('merges occupied open tables and recalculates the target order amount', async () => {
    const { service, tables, orders, auditLogs } = createHarness({ targetStatus: 'OCCUPIED' });

    await service.mergeTable('table-source', { targetTableId: 'table-target' });

    assert.equal(tables.get('table-source')?.status, 'AVAILABLE');
    assert.equal(orders.get('order-source')?.status, 'CANCELLED');
    assert.equal(orders.get('order-target')?.subtotal.toNumber(), 32);
    assert.equal(orders.get('order-target')?.total.toNumber(), 32);
    assert.equal(orders.get('order-target')?.items.length, 3);
    assert.equal(auditLogs.length, 2);
  });

  it('rejects merging a paid table order', async () => {
    const { service } = createHarness({ targetStatus: 'OCCUPIED', sourceOrderStatus: 'PAID' });
    await assert.rejects(() => service.mergeTable('table-source', { targetTableId: 'table-target' }), /Source table must have an open order/);
  });

  it('splits one item and recalculates original and split order amounts', async () => {
    const { service, orders, auditLogs } = createHarness();

    const splitOrder = await service.splitBill('table-source', { items: [{ orderItemId: 'item-1', quantity: 1 }] });

    assert.equal(orders.get('order-source')?.subtotal.toNumber(), 15);
    assert.equal(orders.get('order-source')?.total.toNumber(), 15);
    assert.equal(splitOrder.subtotal, 10);
    assert.equal(splitOrder.total, 10);
    assert.equal(auditLogs.length, 2);
  });

  it('rejects split quantities above the available item quantity', async () => {
    const { service } = createHarness();
    await assert.rejects(() => service.splitBill('table-source', { items: [{ orderItemId: 'item-1', quantity: 3 }] }), /Split quantity exceeds available quantity/);
  });
});
