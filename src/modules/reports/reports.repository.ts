import { Injectable } from '@nestjs/common';
import { CustomerEligibilityMode, OrderStatus, Prisma, RefundStatus } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import type { ReportRange } from './report-range';

export const REPORT_ORDER_STATUSES = [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED];

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  getStore(storeId: string) {
    return this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { id: true, currency: true } });
  }

  orders(storeId: string, range: ReportRange) {
    return this.prisma.order.findMany({
      where: { storeId, status: { in: REPORT_ORDER_STATUSES }, paidAt: { gte: range.start, lte: range.end } },
      include: { items: true, payments: true, refunds: { where: { status: RefundStatus.COMPLETED }, include: { items: true } }, customer: true },
      orderBy: { paidAt: 'asc' },
    });
  }

  refunds(storeId: string, range: ReportRange) {
    return this.prisma.refund.findMany({
      where: { storeId, status: RefundStatus.COMPLETED, createdAt: { gte: range.start, lte: range.end } },
      include: { items: { include: { orderItem: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  customers(storeId: string, range: ReportRange) {
    return this.prisma.customer.findMany({
      where: { storeId, createdAt: { lte: range.end } },
      orderBy: [{ totalSpend: 'desc' }, { lastOrderAt: 'desc' }],
      take: 200,
    });
  }

  pointLedgers(storeId: string, range: ReportRange) {
    return this.prisma.loyaltyPointLedger.findMany({
      where: { storeId, createdAt: { gte: range.start, lte: range.end } },
    });
  }

  campaigns(storeId: string) {
    return this.prisma.campaign.findMany({
      where: { storeId },
      include: { targetCustomerSegment: { select: { name: true } } },
      orderBy: [{ discountTotal: 'desc' }, { usageCount: 'desc' }],
      take: 200,
    });
  }

  shifts(storeId: string, range: ReportRange) {
    return this.prisma.shift.findMany({
      where: { storeId, openedAt: { lte: range.end }, OR: [{ closedAt: null }, { closedAt: { gte: range.start } }] },
      include: { user: true, openedBy: true, closedBy: true, movements: true },
      orderBy: { openedAt: 'asc' },
    });
  }

  activeCustomerCampaigns(storeId: string) {
    return this.prisma.campaign.findMany({
      where: { storeId, customerEligibilityMode: { not: CustomerEligibilityMode.ALL_CUSTOMERS } },
      orderBy: { discountTotal: 'desc' },
      take: 100,
    });
  }

}

export type ReportOrder = Prisma.PromiseReturnType<ReportsRepository['orders']>[number];
export type ReportRefund = Prisma.PromiseReturnType<ReportsRepository['refunds']>[number];
export type ReportShift = Prisma.PromiseReturnType<ReportsRepository['shifts']>[number];
