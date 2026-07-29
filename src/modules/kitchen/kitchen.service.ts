import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KitchenPrintMode, KitchenStationStatus, KitchenTicketStatus, Prisma } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import { CancelKitchenTicketDto, ListKitchenTicketsDto, UpsertKitchenStationDto } from './dto/kitchen.dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

const ACTIVE_TICKET_STATUSES = [KitchenTicketStatus.NEW, KitchenTicketStatus.PREPARING, KitchenTicketStatus.READY];

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async listStations() {
    const storeId = this.getStoreId();
    const stations = await this.prisma.kitchenStation.findMany({
      where: { storeId },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return stations.map((station) => this.presentStation(station));
  }

  async getSettings() {
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: this.getStoreId() },
      select: { kitchenPrintMode: true },
    });
    return { printMode: store.kitchenPrintMode };
  }

  async updatePrintMode(mode: KitchenPrintMode) {
    const store = await this.prisma.store.update({
      where: { id: this.getStoreId() },
      data: { kitchenPrintMode: mode },
      select: { kitchenPrintMode: true },
    });
    return { printMode: store.kitchenPrintMode };
  }

  async createStation(dto: UpsertKitchenStationDto) {
    const storeId = this.getStoreId();
    const code = this.cleanCode(dto.code);
    const station = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.kitchenStation.updateMany({ where: { storeId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.kitchenStation.create({
        data: {
          storeId,
          name: this.cleanName(dto.name),
          code,
          sortOrder: dto.sortOrder ?? 0,
          isDefault: Boolean(dto.isDefault),
        },
      });
    });
    return this.presentStation(station);
  }

  async updateStation(id: string, dto: UpsertKitchenStationDto) {
    const storeId = this.getStoreId();
    await this.findStation(id);
    const station = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.kitchenStation.updateMany({ where: { storeId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.kitchenStation.update({
        where: { id },
        data: {
          name: this.cleanName(dto.name),
          code: this.cleanCode(dto.code),
          sortOrder: dto.sortOrder ?? 0,
          isDefault: Boolean(dto.isDefault),
        },
      });
    });
    return this.presentStation(station);
  }

  async updateStationStatus(id: string, status: KitchenStationStatus) {
    await this.findStation(id);
    const station = await this.prisma.kitchenStation.update({ where: { id }, data: { status } });
    return this.presentStation(station);
  }

  async setDefaultStation(id: string) {
    const storeId = this.getStoreId();
    const target = await this.findStation(id);
    if (target.status !== KitchenStationStatus.ACTIVE) {
      throw new BadRequestException('Only active kitchen stations can be default.');
    }
    const station = await this.prisma.$transaction(async (tx) => {
      await tx.kitchenStation.updateMany({ where: { storeId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.kitchenStation.update({ where: { id }, data: { isDefault: true } });
    });
    return this.presentStation(station);
  }

  async listTickets(query: ListKitchenTicketsDto = {}) {
    const storeId = this.getStoreId();
    const tickets = await this.prisma.kitchenTicket.findMany({
      where: {
        storeId,
        ...(query.stationId ? { stationId: query.stationId } : {}),
        ...(query.status ? { status: this.toStoredStatus(query.status) } : { status: { in: ACTIVE_TICKET_STATUSES } }),
      },
      include: this.ticketInclude(),
      orderBy: [{ createdAt: 'asc' }],
      take: query.take ?? 100,
    });
    return tickets.map((ticket) => this.presentTicket(ticket));
  }

  async getTicket(id: string) {
    const ticket = await this.findTicket(id);
    return this.presentTicket(ticket);
  }

  async startTicket(id: string) {
    const ticket = await this.findTicket(id);
    if (ticket.status === KitchenTicketStatus.PREPARING) {
      return this.presentTicket(ticket);
    }
    if (ticket.status !== KitchenTicketStatus.NEW) {
      throw new BadRequestException('Only new kitchen tickets can be started.');
    }
    return this.updateTicketStatus(id, KitchenTicketStatus.PREPARING, { startedAt: new Date() });
  }

  async markReady(id: string) {
    const ticket = await this.findTicket(id);
    if (ticket.status === KitchenTicketStatus.READY) {
      return this.presentTicket(ticket);
    }
    if (ticket.status !== KitchenTicketStatus.PREPARING && ticket.status !== KitchenTicketStatus.NEW) {
      throw new BadRequestException('Only new or preparing kitchen tickets can be marked ready.');
    }
    return this.updateTicketStatus(id, KitchenTicketStatus.READY, {
      startedAt: ticket.startedAt ?? new Date(),
      readyAt: new Date(),
    });
  }

  async completeTicket(id: string) {
    const ticket = await this.findTicket(id);
    if (ticket.status === KitchenTicketStatus.COMPLETED) {
      return this.presentTicket(ticket);
    }
    if (ticket.status !== KitchenTicketStatus.READY) {
      throw new BadRequestException('Only ready kitchen tickets can be completed.');
    }
    return this.updateTicketStatus(id, KitchenTicketStatus.COMPLETED, { completedAt: new Date() });
  }

  async cancelTicket(id: string, dto: CancelKitchenTicketDto) {
    const ticket = await this.findTicket(id);
    if (ticket.status === KitchenTicketStatus.COMPLETED) {
      throw new BadRequestException('Completed kitchen tickets cannot be cancelled.');
    }
    if (ticket.status === KitchenTicketStatus.CANCELLED) {
      return this.presentTicket(ticket);
    }
    return this.updateTicketStatus(id, KitchenTicketStatus.CANCELLED, {
      cancelledAt: new Date(),
      cancelReason: dto.reason,
    });
  }

  async generateTicketsForOrder(
    tx: Prisma.TransactionClient,
    input: { storeId: string; orderId: string; createdByUserId?: string; orderItemIds?: string[] },
  ) {
    const store = tx.store?.findUnique
      ? await tx.store.findUnique({ where: { id: input.storeId }, select: { kitchenPrintMode: true } })
      : { kitchenPrintMode: KitchenPrintMode.ORDER_TICKET };
    const order = await tx.order.findFirst({
      where: { id: input.orderId, storeId: input.storeId },
      include: {
        items: {
          where: input.orderItemIds ? { id: { in: input.orderItemIds } } : undefined,
          include: {
            product: {
              include: {
                kitchenStation: true,
                categoryRef: { include: { defaultKitchenStation: true } },
              },
            },
          },
        },
      },
    });
    if (!order || order.items.length === 0) {
      return [];
    }

    const defaultStation = await this.ensureDefaultStation(tx, input.storeId);
    const groups = new Map<string, { stationId: string; items: typeof order.items }>();
    for (const item of order.items) {
      const station = this.resolveStation(item.product.kitchenStation, item.product.categoryRef?.defaultKitchenStation, defaultStation);
      const group = groups.get(station.id) ?? { stationId: station.id, items: [] };
      group.items.push(item);
      groups.set(station.id, group);
    }

    const tickets = [];
    for (const group of groups.values()) {
      if (store?.kitchenPrintMode === KitchenPrintMode.ITEM_TICKET) {
        for (const item of group.items) {
          const ticket = await tx.kitchenTicket.create({
            data: {
              storeId: input.storeId,
              orderId: input.orderId,
              stationId: group.stationId,
              ticketNumber: await this.createTicketNumber(tx, input.storeId, group.stationId),
              createdByUserId: input.createdByUserId,
              items: {
                create: {
                  storeId: input.storeId,
                  orderItemId: item.id,
                  productId: item.productId,
                  productNameSnapshot: item.productNameSnapshot ?? item.product.name,
                  quantity: item.quantity,
                  modifiers: item.modifiers ?? Prisma.JsonNull,
                  notes: item.note,
                },
              },
            },
            include: this.ticketInclude(),
          });
          tickets.push(ticket);
        }
        continue;
      }

      const existing = tx.kitchenTicket.findFirst
        ? await tx.kitchenTicket.findFirst({
            where: { storeId: input.storeId, orderId: input.orderId, stationId: group.stationId, status: KitchenTicketStatus.NEW },
            include: this.ticketInclude(),
          })
        : await (tx.kitchenTicket as any).findUnique({
            where: { storeId_orderId_stationId: { storeId: input.storeId, orderId: input.orderId, stationId: group.stationId } },
            include: this.ticketInclude(),
          });
      if (existing) {
        const existingOrderItemIds = new Set(existing.items.map((item: { orderItemId: string }) => item.orderItemId));
        const newItems = group.items.filter((item) => !existingOrderItemIds.has(item.id));
        if (newItems.length > 0 && existing.status === KitchenTicketStatus.NEW) {
          const updated = await tx.kitchenTicket.update({
            where: { id: existing.id },
            data: {
              items: {
                create: newItems.map((item) => ({
                  storeId: input.storeId,
                  orderItemId: item.id,
                  productId: item.productId,
                  productNameSnapshot: item.productNameSnapshot ?? item.product.name,
                  quantity: item.quantity,
                  modifiers: item.modifiers ?? Prisma.JsonNull,
                  notes: item.note,
                })),
              },
            },
            include: this.ticketInclude(),
          });
          tickets.push(updated);
          continue;
        }
        tickets.push(existing);
        continue;
      }

      const ticket = await tx.kitchenTicket.create({
        data: {
          storeId: input.storeId,
          orderId: input.orderId,
          stationId: group.stationId,
          ticketNumber: await this.createTicketNumber(tx, input.storeId, group.stationId),
          createdByUserId: input.createdByUserId,
          items: {
            create: group.items.map((item) => ({
              storeId: input.storeId,
              orderItemId: item.id,
              productId: item.productId,
              productNameSnapshot: item.productNameSnapshot ?? item.product.name,
              quantity: item.quantity,
              modifiers: item.modifiers ?? Prisma.JsonNull,
              notes: item.note,
            })),
          },
        },
        include: this.ticketInclude(),
      });
      tickets.push(ticket);
    }

    return tickets;
  }

  async cancelNewTicketsForOrder(tx: Prisma.TransactionClient, input: { storeId: string; orderId: string; reason: string }) {
    await this.cancelTicketsForOrder(tx, input, [KitchenTicketStatus.NEW]);
  }

  async cancelUnfinishedTicketsForOrder(tx: Prisma.TransactionClient, input: { storeId: string; orderId: string; reason: string }) {
    await this.cancelTicketsForOrder(tx, input, [KitchenTicketStatus.NEW, KitchenTicketStatus.PREPARING, KitchenTicketStatus.READY]);
  }

  private async cancelTicketsForOrder(
    tx: Prisma.TransactionClient,
    input: { storeId: string; orderId: string; reason: string },
    statuses: KitchenTicketStatus[],
  ) {
    const tickets = await tx.kitchenTicket.findMany({
      where: { storeId: input.storeId, orderId: input.orderId, status: { in: statuses } },
      select: { id: true },
    });
    if (tickets.length === 0) {
      return;
    }
    const now = new Date();
    await tx.kitchenTicket.updateMany({
      where: { id: { in: tickets.map((ticket) => ticket.id) } },
      data: { status: KitchenTicketStatus.CANCELLED, cancelledAt: now, cancelReason: input.reason },
    });
    await tx.kitchenTicketItem.updateMany({
      where: { ticketId: { in: tickets.map((ticket) => ticket.id) } },
      data: { status: KitchenTicketStatus.CANCELLED },
    });
  }

  private async updateTicketStatus(id: string, status: KitchenTicketStatus, data: Prisma.KitchenTicketUpdateInput) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.kitchenTicket.update({ where: { id }, data: { ...data, status } });
        await tx.kitchenTicketItem.updateMany({ where: { ticketId: id }, data: { status } });
      },
      { maxWait: 30000, timeout: 60000 },
    );
    const ticket = await this.findTicket(id);
    return this.presentTicket(ticket);
  }

  private async ensureDefaultStation(tx: PrismaLike, storeId: string) {
    const existing = await tx.kitchenStation.findFirst({
      where: { storeId, status: KitchenStationStatus.ACTIVE, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      return existing;
    }
    const firstActive = await tx.kitchenStation.findFirst({
      where: { storeId, status: KitchenStationStatus.ACTIVE },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (firstActive) {
      await tx.kitchenStation.update({ where: { id: firstActive.id }, data: { isDefault: true } });
      return { ...firstActive, isDefault: true };
    }
    return tx.kitchenStation.create({
      data: {
        storeId,
        name: 'Main Kitchen',
        code: 'MAIN',
        isDefault: true,
      },
    });
  }

  private resolveStation(
    productStation: { id: string; status: KitchenStationStatus } | null,
    categoryStation: { id: string; status: KitchenStationStatus } | null | undefined,
    defaultStation: { id: string },
  ) {
    if (productStation?.status === KitchenStationStatus.ACTIVE) {
      return productStation;
    }
    if (categoryStation?.status === KitchenStationStatus.ACTIVE) {
      return categoryStation;
    }
    return defaultStation;
  }

  private async createTicketNumber(tx: Prisma.TransactionClient, storeId: string, stationId: string) {
    const station = await tx.kitchenStation.findFirst({ where: { id: stationId, storeId } });
    const prefix = station?.code ?? 'KDS';
    const count = await tx.kitchenTicket.count({ where: { storeId, stationId } });
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${prefix}-${String(count + 1).padStart(4, '0')}-${suffix}`;
  }

  private async findStation(id: string) {
    const station = await this.prisma.kitchenStation.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!station) {
      throw new NotFoundException('Kitchen station not found.');
    }
    return station;
  }

  private async findTicket(id: string) {
    const ticket = await this.prisma.kitchenTicket.findFirst({
      where: { id, storeId: this.getStoreId() },
      include: this.ticketInclude(),
    });
    if (!ticket) {
      throw new NotFoundException('Kitchen ticket not found.');
    }
    return ticket;
  }

  private ticketInclude() {
    return {
      station: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          pickupNumber: true,
          status: true,
          total: true,
          createdAt: true,
        },
      },
      items: { orderBy: { createdAt: 'asc' as const } },
    };
  }

  private presentTicket(ticket: Prisma.KitchenTicketGetPayload<{ include: ReturnType<KitchenService['ticketInclude']> }>) {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: this.toPublicStatus(ticket.status),
      station: this.presentStation(ticket.station),
      order: {
        id: ticket.order.id,
        orderNumber: ticket.order.orderNumber,
        pickupNumber: ticket.order.pickupNumber,
        status: ticket.order.status,
        total: toMoneyNumber(ticket.order.total),
        createdAt: ticket.order.createdAt.toISOString(),
      },
      items: ticket.items.map((item) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        productId: item.productId,
        productName: item.productNameSnapshot,
        quantity: item.quantity,
        modifiers: item.modifiers ?? [],
        notes: item.notes,
        status: this.toPublicStatus(item.status),
      })),
      startedAt: ticket.startedAt?.toISOString() ?? null,
      readyAt: ticket.readyAt?.toISOString() ?? null,
      completedAt: ticket.completedAt?.toISOString() ?? null,
      cancelledAt: ticket.cancelledAt?.toISOString() ?? null,
      cancelReason: ticket.cancelReason,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    };
  }

  private presentStation(station: {
    id: string;
    name: string;
    code: string;
    status: KitchenStationStatus;
    sortOrder: number;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: station.id,
      name: station.name,
      code: station.code,
      status: station.status,
      sortOrder: station.sortOrder,
      isDefault: station.isDefault,
      createdAt: station.createdAt.toISOString(),
      updatedAt: station.updatedAt.toISOString(),
    };
  }

  private cleanName(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Kitchen station name is required.');
    }
    return trimmed;
  }

  private cleanCode(value: string) {
    const trimmed = value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!trimmed) {
      throw new BadRequestException('Kitchen station code is required.');
    }
    return trimmed;
  }

  private toStoredStatus(status: ListKitchenTicketsDto['status']) {
    return status === 'IN_PROGRESS' ? KitchenTicketStatus.PREPARING : status;
  }

  private toPublicStatus(status: KitchenTicketStatus) {
    return status === KitchenTicketStatus.PREPARING ? 'IN_PROGRESS' : status;
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
