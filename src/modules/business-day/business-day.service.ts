import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessDay, BusinessDayStatus, OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { PrismaService } from '@/prisma/prisma.service';

import { CloseBusinessDayDto, OpenBusinessDayDto } from './dto/business-day.dto';

@Injectable()
export class BusinessDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async current() {
    const day = await this.prisma.businessDay.findFirst({
      where: { storeId: this.getStoreId(), status: BusinessDayStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    });
    return day ? this.present(day) : null;
  }

  async open(dto: OpenBusinessDayDto, currentUser?: AuthRequestUser) {
    const storeId = this.getStoreId();
    const existing = await this.prisma.businessDay.findFirst({ where: { storeId, status: BusinessDayStatus.OPEN } });
    if (existing) {
      return this.present(existing);
    }
    const created = await this.prisma.businessDay.create({
      data: {
        storeId,
        businessDate: this.resolveBusinessDate(dto.businessDate),
        notes: dto.notes,
        openedByUserId: currentUser?.id,
      },
    });
    return this.present(created);
  }

  async close(id: string, dto: CloseBusinessDayDto, currentUser?: AuthRequestUser) {
    const day = await this.prisma.businessDay.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!day) {
      throw new NotFoundException('Business day not found.');
    }
    if (day.status !== BusinessDayStatus.OPEN) {
      return this.present(day);
    }

    const summary = await this.calculateSummary(day);
    const closed = await this.prisma.businessDay.update({
      where: { id },
      data: {
        status: BusinessDayStatus.CLOSED,
        closedAt: new Date(),
        closedByUserId: currentUser?.id,
        orderCount: summary.orderCount,
        grossSales: summary.grossSales,
        refundTotal: summary.refundTotal,
        netSales: summary.netSales,
        notes: dto.notes ?? day.notes,
      },
    });
    return this.present(closed);
  }

  async list() {
    const days = await this.prisma.businessDay.findMany({
      where: { storeId: this.getStoreId() },
      orderBy: { openedAt: 'desc' },
      take: 30,
    });
    return days.map((day) => this.present(day));
  }

  private async calculateSummary(day: BusinessDay) {
    const range = this.dayRange(day.businessDate);
    const paidStatuses = [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED];
    const [orders, refunds] = await Promise.all([
      this.prisma.order.aggregate({
        where: { storeId: day.storeId, status: { in: paidStatuses }, paidAt: { gte: range.start, lt: range.end } },
        _count: true,
        _sum: { total: true },
      }),
      this.prisma.refund.aggregate({
        where: { storeId: day.storeId, createdAt: { gte: range.start, lt: range.end } },
        _sum: { amount: true },
      }),
    ]);
    const grossSales = new Decimal(orders._sum.total ?? 0).toDecimalPlaces(2);
    const refundTotal = new Decimal(refunds._sum.amount ?? 0).toDecimalPlaces(2);
    return {
      orderCount: orders._count,
      grossSales,
      refundTotal,
      netSales: grossSales.minus(refundTotal).toDecimalPlaces(2),
    };
  }

  private resolveBusinessDate(input?: string) {
    if (!input) {
      const now = new Date();
      return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }
    return new Date(`${input.slice(0, 10)}T00:00:00.000Z`);
  }

  private dayRange(businessDate: Date) {
    const start = new Date(businessDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);
    return { start, end };
  }

  private present(day: BusinessDay) {
    return {
      id: day.id,
      status: day.status,
      businessDate: day.businessDate.toISOString().slice(0, 10),
      openedAt: day.openedAt.toISOString(),
      closedAt: day.closedAt?.toISOString() ?? null,
      openedByUserId: day.openedByUserId,
      closedByUserId: day.closedByUserId,
      orderCount: day.orderCount,
      grossSales: toMoneyNumber(day.grossSales),
      refundTotal: toMoneyNumber(day.refundTotal),
      netSales: toMoneyNumber(day.netSales),
      notes: day.notes,
    };
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
