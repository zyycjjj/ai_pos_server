import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { KitchenPrintMode, KitchenStationStatus, KitchenTicketStatus, OrderAuditAction, Prisma, StoreRole } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { PrismaService } from '@/prisma/prisma.service';

import { AssignKitchenStaffStationsDto, CancelKitchenTicketDto, ListKitchenTicketHistoryDto, ListKitchenTicketsDto, UpdateKitchenTicketPriorityDto, UpsertKitchenStationDto } from './dto/kitchen.dto';
import { assertKitchenOperator, canSeeAllKitchenStations, getPermittedKitchenStationIds } from './kitchen-permissions';
import { assertTicketCanChangePriority, sortPresentedKitchenTickets } from './kitchen-priority';
import { buildKitchenTicketPreview } from './kitchen-preview';
import { calculateKitchenSla } from './kitchen-sla';

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
    this.validateSla(dto.warningMinutes, dto.overdueMinutes);
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
          warningMinutes: dto.warningMinutes ?? 8,
          overdueMinutes: dto.overdueMinutes ?? 15,
        },
      });
    });
    return this.presentStation(station);
  }

  async updateStation(id: string, dto: UpsertKitchenStationDto) {
    this.validateSla(dto.warningMinutes, dto.overdueMinutes);
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
          warningMinutes: dto.warningMinutes ?? 8,
          overdueMinutes: dto.overdueMinutes ?? 15,
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

  async listTickets(query: ListKitchenTicketsDto = {}, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const stationWhere = await this.resolveStationWhere(storeId, query.stationId, currentUser);
    const tickets = await this.prisma.kitchenTicket.findMany({
      where: {
        storeId,
        ...stationWhere,
        ...(query.status ? { status: this.toStoredStatus(query.status) } : { status: { in: ACTIVE_TICKET_STATUSES } }),
      },
      include: this.ticketInclude(),
      orderBy: [{ createdAt: 'asc' }],
      take: query.take ?? 100,
    });
    return sortPresentedKitchenTickets(tickets.map((ticket) => this.presentTicket(ticket)));
  }

  async listTicketHistory(query: ListKitchenTicketHistoryDto = {}, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const stationWhere = await this.resolveStationWhere(storeId, query.stationId, currentUser);
    const range = this.resolveHistoryRange(query);
    const status = query.status ? this.toStoredStatus(query.status) : { in: [KitchenTicketStatus.READY, KitchenTicketStatus.COMPLETED, KitchenTicketStatus.CANCELLED] };
    const tickets = await this.prisma.kitchenTicket.findMany({
      where: {
        storeId,
        ...stationWhere,
        status,
        createdAt: range,
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.tableId ? { order: { tableId: query.tableId } } : {}),
      },
      include: this.ticketInclude(),
      orderBy: [{ updatedAt: 'desc' }],
      take: query.take ?? 100,
    });
    return tickets.map((ticket) => this.presentTicket(ticket));
  }

  async getTicket(id: string, currentUser?: AuthRequestUser) {
    const ticket = await this.findTicket(id);
    await this.assertTicketVisible(ticket.stationId, currentUser);
    return this.presentTicket(ticket);
  }

  async previewTicket(id: string, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const ticket = await this.prisma.kitchenTicket.findFirst({
      where: { id, storeId },
      include: { station: true, order: { include: { table: true } }, items: { orderBy: { createdAt: 'asc' } }, store: true },
    });
    if (!ticket) throw new NotFoundException('Kitchen ticket not found.');
    await this.assertTicketVisible(ticket.stationId, currentUser);
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { kitchenPrintMode: true } });
    return buildKitchenTicketPreview(ticket, store.kitchenPrintMode);
  }

  async startTicket(id: string, currentUser?: AuthRequestUser) {
    const ticket = await this.findTicket(id);
    await this.assertTicketVisible(ticket.stationId, currentUser);
    if (ticket.status === KitchenTicketStatus.PREPARING) {
      return this.presentTicket(ticket);
    }
    if (ticket.status !== KitchenTicketStatus.NEW) {
      throw new BadRequestException('Only new kitchen tickets can be started.');
    }
    return this.updateTicketStatus(id, KitchenTicketStatus.PREPARING, { startedAt: new Date() });
  }

  async markReady(id: string, currentUser?: AuthRequestUser) {
    const ticket = await this.findTicket(id);
    await this.assertTicketVisible(ticket.stationId, currentUser);
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

  async completeTicket(id: string, currentUser?: AuthRequestUser) {
    const ticket = await this.findTicket(id);
    await this.assertTicketVisible(ticket.stationId, currentUser);
    if (ticket.status === KitchenTicketStatus.COMPLETED) {
      return this.presentTicket(ticket);
    }
    if (ticket.status !== KitchenTicketStatus.READY) {
      throw new BadRequestException('Only ready kitchen tickets can be completed.');
    }
    return this.updateTicketStatus(id, KitchenTicketStatus.COMPLETED, { completedAt: new Date() });
  }

  async cancelTicket(id: string, dto: CancelKitchenTicketDto, currentUser?: AuthRequestUser) {
    const ticket = await this.findTicket(id);
    await this.assertTicketVisible(ticket.stationId, currentUser);
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

  async rushTicket(id: string, dto: UpdateKitchenTicketPriorityDto = {}, currentUser?: AuthRequestUser) {
    const ticket = await this.findTicket(id);
    await this.assertTicketVisible(ticket.stationId, currentUser, true);
    if (!assertTicketCanChangePriority(ticket.status)) {
      throw new BadRequestException('Ready, completed, or cancelled kitchen tickets cannot be rushed.');
    }
    const reason = dto.reason?.trim() || 'Kitchen ticket rushed.';
    await this.prisma.$transaction(async (tx) => {
      await tx.kitchenTicket.update({
        where: { id },
        data: { urgent: true, rushReason: reason, rushedAt: new Date(), rushedByUserId: currentUser?.id },
      });
      await tx.orderAuditLog.create({
        data: {
          storeId: ticket.storeId,
          orderId: ticket.orderId,
          action: OrderAuditAction.KITCHEN_TICKET_RUSHED,
          reason: this.formatPriorityAuditReason(ticket, reason),
          operatorId: currentUser?.id,
        },
      });
    });
    return this.getTicket(id, currentUser);
  }

  async unrushTicket(id: string, dto: UpdateKitchenTicketPriorityDto = {}, currentUser?: AuthRequestUser) {
    const ticket = await this.findTicket(id);
    await this.assertTicketVisible(ticket.stationId, currentUser, true);
    if (!assertTicketCanChangePriority(ticket.status)) {
      throw new BadRequestException('Ready, completed, or cancelled kitchen tickets cannot be un-rushed.');
    }
    const reason = dto.reason?.trim() || 'Kitchen ticket priority cleared.';
    await this.prisma.$transaction(async (tx) => {
      await tx.kitchenTicket.update({
        where: { id },
        data: { urgent: false, rushReason: null, rushedAt: null, rushedByUserId: null },
      });
      await tx.orderAuditLog.create({
        data: {
          storeId: ticket.storeId,
          orderId: ticket.orderId,
          action: OrderAuditAction.KITCHEN_TICKET_UNRUSHED,
          reason: this.formatPriorityAuditReason(ticket, reason),
          operatorId: currentUser?.id,
        },
      });
    });
    return this.getTicket(id, currentUser);
  }

  async listKitchenStaffStations() {
    const storeId = this.getStoreId();
    const staff = await this.prisma.storeUser.findMany({
      where: { storeId, role: StoreRole.KITCHEN },
      include: { user: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    const assignments = await this.prisma.kitchenStaffStation.findMany({
      where: { storeId },
      include: { station: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    const byUser = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      byUser.set(assignment.userId, [...(byUser.get(assignment.userId) ?? []), assignment]);
    }
    return staff.map((item) => ({
      storeUserId: item.id,
      userId: item.userId,
      email: item.user.email,
      name: item.user.name,
      role: item.role,
      stations: (byUser.get(item.userId) ?? []).map((assignment) => this.presentStation(assignment.station)),
    }));
  }

  async assignKitchenStaffStations(dto: AssignKitchenStaffStationsDto) {
    const storeId = this.getStoreId();
    const staff = await this.prisma.storeUser.findFirst({ where: { storeId, userId: dto.userId, role: StoreRole.KITCHEN } });
    if (!staff) throw new NotFoundException('Kitchen staff member not found.');
    const stationIds = [...new Set(dto.stationIds ?? [])];
    const stations = await this.prisma.kitchenStation.findMany({ where: { storeId, id: { in: stationIds } } });
    if (stations.length !== stationIds.length) throw new NotFoundException('Kitchen station not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.kitchenStaffStation.deleteMany({ where: { storeId, userId: dto.userId } });
      if (stationIds.length > 0) {
        await tx.kitchenStaffStation.createMany({
          data: stationIds.map((stationId) => ({ storeId, userId: dto.userId, stationId })),
          skipDuplicates: true,
        });
      }
    });
    return this.listKitchenStaffStations();
  }

  async getRouteSummary() {
    const storeId = this.getStoreId();
    const [products, categories, routes] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId, isActive: true },
        include: { categoryRef: { include: { defaultKitchenStation: true } }, kitchenStation: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.category.findMany({ where: { storeId, status: 'ACTIVE' }, include: { defaultKitchenStation: true }, orderBy: { name: 'asc' } }),
      this.prisma.printerRoute.findMany({
        where: { storeId, documentType: 'KITCHEN_TICKET' },
        include: { printer: true },
        orderBy: [{ routeType: 'asc' }, { targetId: 'asc' }],
      }),
    ]);
    const unroutedProducts = products
      .filter((product) => !product.kitchenStationId && !product.categoryRef?.defaultKitchenStationId)
      .map((product) => ({
        id: product.id,
        name: product.name,
        categoryName: product.categoryRef?.name ?? product.category,
      }));
    const unroutedCategories = categories
      .filter((category) => !category.defaultKitchenStationId)
      .map((category) => ({ id: category.id, name: category.name }));
    return {
      unroutedProductCount: unroutedProducts.length,
      unroutedCategoryCount: unroutedCategories.length,
      unroutedProducts,
      unroutedCategories,
      routes: routes.map((route) => ({
        id: route.id,
        routeType: route.routeType,
        targetId: route.targetId,
        documentType: route.documentType,
        printerId: route.printerId,
        printerName: route.printer?.name ?? null,
      })),
    };
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
        warningMinutes: 8,
        overdueMinutes: 15,
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
          table: { select: { id: true, name: true } },
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
        table: ticket.order.table ? { id: ticket.order.table.id, name: ticket.order.table.name } : null,
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
      urgent: ticket.urgent,
      rushReason: ticket.rushReason,
      rushedAt: ticket.rushedAt?.toISOString() ?? null,
      ...calculateKitchenSla(ticket),
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
    warningMinutes: number;
    overdueMinutes: number;
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
      warningMinutes: station.warningMinutes,
      overdueMinutes: station.overdueMinutes,
      createdAt: station.createdAt.toISOString(),
      updatedAt: station.updatedAt.toISOString(),
    };
  }

  private async resolveStationWhere(storeId: string, requestedStationId?: string, currentUser?: AuthRequestUser) {
    const permittedStationIds = await getPermittedKitchenStationIds(this.prisma, storeId, currentUser);
    if (permittedStationIds === null) return requestedStationId ? { stationId: requestedStationId } : {};
    if (requestedStationId) {
      return permittedStationIds.includes(requestedStationId) ? { stationId: requestedStationId } : { stationId: '__NO_STATION_PERMISSION__' };
    }
    if (permittedStationIds.length === 0) return { stationId: '__NO_STATION_PERMISSION__' };
    return { stationId: { in: permittedStationIds } };
  }

  private async assertTicketVisible(stationId: string, currentUser?: AuthRequestUser, allowCashier = false) {
    if (!currentUser) return;
    if (allowCashier && currentUser.role === StoreRole.CASHIER) return;
    assertKitchenOperator(currentUser);
    if (canSeeAllKitchenStations(currentUser) || currentUser.role === StoreRole.STAFF) return;
    const permittedStationIds = await getPermittedKitchenStationIds(this.prisma, this.getStoreId(), currentUser);
    if (permittedStationIds === null || permittedStationIds.includes(stationId)) return;
    throw new ForbiddenException('Kitchen staff is not assigned to this station.');
  }

  private resolveHistoryRange(query: ListKitchenTicketHistoryDto) {
    const from = query.from ? new Date(query.from) : new Date();
    if (!query.from) from.setHours(0, 0, 0, 0);
    const to = query.to ? new Date(query.to) : new Date();
    return { gte: from, lte: to };
  }

  private formatPriorityAuditReason(ticket: { id: string; stationId: string; order: { table?: { id: string; name: string } | null } }, reason: string) {
    const table = ticket.order.table ? ` table=${ticket.order.table.name}` : '';
    return `${reason} ticketId=${ticket.id} stationId=${ticket.stationId}${table}`;
  }

  private validateSla(warningMinutes = 8, overdueMinutes = 15) {
    if (warningMinutes >= overdueMinutes) {
      throw new BadRequestException('Kitchen station overdueMinutes must be greater than warningMinutes.');
    }
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
