import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async getTodaySummary() {
    const storeId = this.getStoreId();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const paidStatuses = [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED];
    const paidAggregate = await this.prisma.order.aggregate({
      where: {
        storeId,
        status: { in: paidStatuses },
        paidAt: { gte: start },
      },
      _sum: { total: true },
      _count: true,
    });
    const refundAggregate = await this.prisma.refund.aggregate({
      where: {
        storeId,
        createdAt: { gte: start },
      },
      _sum: { amount: true },
      _count: true,
    });
    const activeProducts = await this.prisma.product.count({ where: { storeId, isActive: true } });
    const recentOrders = await this.prisma.order.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
      },
    });

    const orderCount = paidAggregate._count;
    const grossSales = toMoneyNumber(paidAggregate._sum.total ?? 0);
    const refundTotal = toMoneyNumber(refundAggregate._sum.amount ?? 0);
    const salesTotal = toMoneyNumber(grossSales - refundTotal);

    return {
      salesTotal,
      grossSales,
      netSales: salesTotal,
      refundTotal,
      refundCount: refundAggregate._count,
      orderCount,
      averageTicket: orderCount > 0 ? toMoneyNumber(salesTotal / orderCount) : 0,
      activeProducts,
      recentOrders: recentOrders.map((order) => ({
        ...order,
        total: toMoneyNumber(order.total),
        createdAt: order.createdAt.toISOString(),
      })),
    };
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
