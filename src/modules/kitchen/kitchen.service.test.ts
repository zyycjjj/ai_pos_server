import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenStationStatus, KitchenTicketStatus } from '@prisma/client';

import { KitchenService } from './kitchen.service';
import { calculateKitchenSla } from './kitchen-sla';
import { sortPresentedKitchenTickets } from './kitchen-priority';

describe('KitchenService', () => {
  it('generates one idempotent ticket per station and keeps modifier snapshots', async () => {
    const createdAt = new Date('2026-07-07T00:00:00.000Z');
    const stations = {
      bar: {
        id: 'bar',
        storeId: 'store-1',
        name: 'Bar',
        code: 'BAR',
        status: KitchenStationStatus.ACTIVE,
        sortOrder: 1,
        isDefault: false,
        createdAt,
        updatedAt: createdAt,
      },
      hot: {
        id: 'hot',
        storeId: 'store-1',
        name: 'Hot Kitchen',
        code: 'HOT',
        status: KitchenStationStatus.ACTIVE,
        sortOrder: 2,
        isDefault: true,
        createdAt,
        updatedAt: createdAt,
      },
    };
    const createdTickets: any[] = [];
    const order = {
      id: 'order-1',
      storeId: 'store-1',
      items: [
        {
          id: 'item-bar',
          productId: 'milk-tea',
          productNameSnapshot: 'Milk Tea',
          quantity: 2,
          modifiers: [{ groupName: 'Size', optionName: 'Large' }],
          product: { id: 'milk-tea', name: 'Milk Tea', kitchenStation: stations.bar, categoryRef: null },
        },
        {
          id: 'item-hot',
          productId: 'rice',
          productNameSnapshot: 'Chicken Rice',
          quantity: 1,
          modifiers: null,
          product: { id: 'rice', name: 'Chicken Rice', kitchenStation: stations.hot, categoryRef: null },
        },
      ],
    };
    const tx = {
      order: {
        findFirst: async () => order,
      },
      kitchenStation: {
        findFirst: async ({ where }: any) => (where.isDefault ? stations.hot : stations.bar),
        findUnique: async () => stations.bar,
        count: async () => 0,
        update: async () => stations.hot,
        create: async () => stations.hot,
      },
      kitchenTicket: {
        count: async () => 0,
        findUnique: async () => null,
        create: async ({ data }: any) => {
          const ticket = {
            id: `ticket-${createdTickets.length + 1}`,
            ticketNumber: data.ticketNumber,
            status: KitchenTicketStatus.NEW,
            stationId: data.stationId,
            items: data.items.create,
          };
          createdTickets.push(ticket);
          return ticket;
        },
      },
    };
    const service = new KitchenService({} as any);

    await service.generateTicketsForOrder(tx as any, { storeId: 'store-1', orderId: 'order-1', createdByUserId: 'user-1' });

    assert.equal(createdTickets.length, 2);
    assert.deepEqual(
      createdTickets.map((ticket) => ticket.stationId).sort(),
      ['bar', 'hot'],
    );
    assert.deepEqual(createdTickets.find((ticket) => ticket.stationId === 'bar')?.items[0].modifiers, [
      { groupName: 'Size', optionName: 'Large' },
    ]);
  });

  it('cancels only unfinished tickets for order lifecycle actions', async () => {
    const updated: any[] = [];
    const tx = {
      kitchenTicket: {
        findMany: async () => [{ id: 'ticket-new' }, { id: 'ticket-preparing' }],
        updateMany: async (input: any) => updated.push({ model: 'ticket', input }),
      },
      kitchenTicketItem: {
        updateMany: async (input: any) => updated.push({ model: 'item', input }),
      },
    };
    const service = new KitchenService({} as any);

    await service.cancelUnfinishedTicketsForOrder(tx as any, {
      storeId: 'store-1',
      orderId: 'order-1',
      reason: 'Void order',
    });

    assert.equal(updated.length, 2);
    assert.equal(updated[0].input.data.status, KitchenTicketStatus.CANCELLED);
    assert.equal(updated[0].input.data.cancelReason, 'Void order');
    assert.deepEqual(updated[1].input.where.ticketId, { in: ['ticket-new', 'ticket-preparing'] });
  });

  it('calculates kitchen SLA and sorts urgent overdue tickets first', () => {
    const now = new Date('2026-07-29T10:20:00.000Z');
    const station = { warningMinutes: 8, overdueMinutes: 15 };

    assert.deepEqual(
      calculateKitchenSla({
        status: KitchenTicketStatus.NEW,
        createdAt: new Date('2026-07-29T10:10:00.000Z'),
        startedAt: null,
        readyAt: null,
        completedAt: null,
        cancelledAt: null,
        station,
      }, now),
      { waitMinutes: 10, cookMinutes: null, slaStatus: 'WARNING' },
    );

    const sorted = sortPresentedKitchenTickets([
      { id: 'normal', urgent: false, slaStatus: 'OVERDUE', createdAt: '2026-07-29T10:00:00.000Z' },
      { id: 'urgent', urgent: true, slaStatus: 'NORMAL', createdAt: '2026-07-29T10:05:00.000Z' },
      { id: 'warning', urgent: false, slaStatus: 'WARNING', createdAt: '2026-07-29T09:55:00.000Z' },
    ]);

    assert.deepEqual(sorted.map((ticket) => ticket.id), ['urgent', 'normal', 'warning']);
  });
});
