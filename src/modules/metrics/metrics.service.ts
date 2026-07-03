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

    const paidAggregate = await this.prisma.order.aggregate({
      where: {
        storeId,
        status: OrderStatus.PAID,
        paidAt: { gte: start },
      },
      _sum: { total: true },
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
    };
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
