import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodaySummary() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [paidAggregate, paidOrders, activeProducts, recentOrders] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          status: OrderStatus.PAID,
          paidAt: { gte: start },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.order.findMany({
        where: {
          status: OrderStatus.PAID,
          paidAt: { gte: start },
        },
        select: { total: true },
      }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
        },
      }),
    ]);

    const orderCount = paidAggregate._count;
    const salesTotal = toMoneyNumber(paidAggregate._sum.total ?? 0);

    return {
      salesTotal,
      orderCount,
      averageTicket: orderCount > 0 ? toMoneyNumber(salesTotal / orderCount) : 0,
      activeProducts,
      recentOrders: recentOrders.map((order) => ({
        ...order,
        total: toMoneyNumber(order.total),
        createdAt: order.createdAt.toISOString(),
      })),
      paidOrderTotals: paidOrders.map((order) => toMoneyNumber(order.total)),
    };
  }
}
