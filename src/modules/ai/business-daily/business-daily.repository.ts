import { Injectable } from '@nestjs/common';
import { CampaignStatus, OrderAuditAction, OrderStatus, ProductAvailabilityStatus, RefundStatus } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import type { BusinessDailyRange } from './business-daily.types';

const ORDER_STATUSES = [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED];

@Injectable()
export class BusinessDailyRepository {
  constructor(private readonly prisma: PrismaService) {}

  load(storeId: string, range: BusinessDailyRange) {
    return Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { id: true, name: true, currency: true } }),
      this.prisma.order.findMany({
        where: { storeId, status: { in: ORDER_STATUSES }, paidAt: { gte: range.start, lte: range.end } },
        include: { items: true, refunds: { where: { status: RefundStatus.COMPLETED } }, table: true, customer: true, auditLogs: true },
        orderBy: { paidAt: 'asc' },
        take: 500,
      }),
      this.prisma.order.findMany({
        where: { storeId, status: OrderStatus.CANCELLED, createdAt: { gte: range.start, lte: range.end }, tableId: { not: null } },
        include: { table: true },
        take: 100,
      }),
      this.prisma.refund.findMany({
        where: { storeId, status: RefundStatus.COMPLETED, createdAt: { gte: range.start, lte: range.end } },
        include: { order: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { storeId },
        select: { id: true, name: true, isActive: true, availabilityStatus: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.prisma.customer.findMany({
        where: { storeId, createdAt: { lte: range.end } },
        orderBy: [{ totalSpend: 'desc' }, { lastOrderAt: 'desc' }],
        take: 200,
      }),
      this.prisma.loyaltyPointLedger.findMany({
        where: { storeId, createdAt: { gte: range.start, lte: range.end } },
      }),
      this.prisma.campaign.findMany({
        where: { storeId },
        orderBy: [{ discountTotal: 'desc' }, { usageCount: 'desc' }],
        take: 100,
      }),
      this.prisma.kitchenTicket.findMany({
        where: { storeId, createdAt: { gte: range.start, lte: range.end } },
        include: { station: true, order: { include: { table: true } } },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      this.prisma.orderAuditLog.findMany({
        where: { storeId, createdAt: { gte: range.start, lte: range.end }, action: { in: [OrderAuditAction.MANAGER_APPROVAL, OrderAuditAction.VOIDED, OrderAuditAction.REFUNDED] } },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      this.prisma.cashMovement.findMany({
        where: { storeId, createdAt: { gte: range.start, lte: range.end }, type: 'CASH_OUT' },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    ]).then(([store, orders, cancelledTableOrders, refunds, products, customers, pointLedgers, campaigns, kitchenTickets, auditLogs, cashOutMovements]) => ({
      store,
      orders,
      cancelledTableOrders,
      refunds,
      products,
      customers,
      pointLedgers,
      campaigns,
      kitchenTickets,
      auditLogs,
      cashOutMovements,
      soldOutProducts: products.filter((product) => product.availabilityStatus === ProductAvailabilityStatus.SOLD_OUT),
      inactiveProducts: products.filter((product) => product.isActive === false),
      activeCampaigns: campaigns.filter((campaign) => campaign.status === CampaignStatus.ACTIVE),
    }));
  }
}

export type BusinessDailyRawData = Awaited<ReturnType<BusinessDailyRepository['load']>>;
