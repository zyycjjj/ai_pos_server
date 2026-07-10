import { Injectable } from '@nestjs/common';
import { Prisma, RefundStatus } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import { durationMinutes, roundMetric } from '../domain/analytics-math';
import type { AnalyticsPeriod } from '../analytics.types';

const rawNumber = (value: unknown) => Number(value ?? 0);

@Injectable()
export class OperationsAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async refunds(storeId: string, period: AnalyticsPeriod, grossSales: number, paidOrderCount: number) {
    const [summary, reasons, products, refundedOrders] = await Promise.all([
      this.prisma.refund.aggregate({
        where: { storeId, status: RefundStatus.COMPLETED, createdAt: { gte: period.start, lt: period.end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.refund.groupBy({
        by: ['reason'],
        where: { storeId, status: RefundStatus.COMPLETED, createdAt: { gte: period.start, lt: period.end } },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      this.prisma.$queryRaw<Array<{ productId: string; name: string; quantity: unknown; amount: unknown }>>(Prisma.sql`
        SELECT oi.productId, COALESCE(MAX(oi.productNameSnapshot), MAX(p.name), 'Unknown product') AS name,
          COALESCE(SUM(ri.quantity), 0) AS quantity, COALESCE(SUM(ri.amount), 0) AS amount
        FROM RefundItem ri
        INNER JOIN Refund r ON r.id = ri.refundId
        INNER JOIN OrderItem oi ON oi.id = ri.orderItemId
        LEFT JOIN Product p ON p.id = oi.productId
        WHERE r.storeId = ${storeId} AND r.status = 'COMPLETED'
          AND r.createdAt >= ${period.start} AND r.createdAt < ${period.end}
        GROUP BY oi.productId
        ORDER BY amount DESC
        LIMIT 10
      `),
      this.prisma.refund.groupBy({
        by: ['orderId'],
        where: { storeId, status: RefundStatus.COMPLETED, createdAt: { gte: period.start, lt: period.end } },
      }),
    ]);
    const refundTotal = toMoneyNumber(summary._sum.amount ?? 0);
    return {
      refundTotal,
      refundCount: summary._count,
      refundRate: grossSales === 0 ? 0 : roundMetric(refundTotal / grossSales, 4),
      refundedOrderRate: paidOrderCount === 0 ? 0 : roundMetric(refundedOrders.length / paidOrderCount, 4),
      topReasons: reasons.map((reason) => ({ reason: reason.reason, count: reason._count, amount: toMoneyNumber(reason._sum.amount ?? 0) })),
      topRefundedProducts: products.map((product) => ({
        productId: product.productId,
        name: product.name,
        quantity: Number(product.quantity),
        amount: roundMetric(rawNumber(product.amount)),
      })),
    };
  }

  async shifts(storeId: string, period: AnalyticsPeriod) {
    const rows = await this.prisma.$queryRaw<Array<{
      shiftId: string;
      staffName: string | null;
      openedAt: Date;
      closedAt: Date | null;
      cashVariance: unknown;
      grossSales: unknown;
      refundTotal: unknown;
      orderCount: bigint | number;
    }>>(Prisma.sql`
      SELECT s.id AS shiftId, u.name AS staffName, s.openedAt, s.closedAt, s.variance AS cashVariance,
        COALESCE((SELECT SUM(o.total) FROM \`Order\` o
          WHERE o.storeId = s.storeId AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
            AND o.paidAt >= s.openedAt AND o.paidAt < COALESCE(s.closedAt, ${period.end})
            AND o.paidAt >= ${period.start} AND o.paidAt < ${period.end}), 0) AS grossSales,
        COALESCE((SELECT SUM(r.amount) FROM Refund r
          WHERE r.storeId = s.storeId AND r.status = 'COMPLETED'
            AND r.createdAt >= s.openedAt AND r.createdAt < COALESCE(s.closedAt, ${period.end})
            AND r.createdAt >= ${period.start} AND r.createdAt < ${period.end}), 0) AS refundTotal,
        (SELECT COUNT(*) FROM \`Order\` o
          WHERE o.storeId = s.storeId AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
            AND o.paidAt >= s.openedAt AND o.paidAt < COALESCE(s.closedAt, ${period.end})
            AND o.paidAt >= ${period.start} AND o.paidAt < ${period.end}) AS orderCount
      FROM Shift s
      INNER JOIN \`User\` u ON u.id = s.userId
      WHERE s.storeId = ${storeId} AND s.openedAt < ${period.end} AND COALESCE(s.closedAt, ${period.end}) >= ${period.start}
      ORDER BY s.openedAt DESC
      LIMIT 50
    `);
    return rows.map((row) => {
      const grossSales = roundMetric(rawNumber(row.grossSales));
      const refundTotal = roundMetric(rawNumber(row.refundTotal));
      const end = row.closedAt ?? period.end;
      return {
        shiftId: row.shiftId,
        staffName: row.staffName ?? 'Unnamed staff',
        openedAt: row.openedAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
        durationMinutes: Math.max(0, Math.round((end.getTime() - row.openedAt.getTime()) / 60_000)),
        grossSales,
        refundTotal,
        netSales: roundMetric(grossSales - refundTotal),
        orderCount: Number(row.orderCount),
        cashVariance: row.cashVariance === null ? null : roundMetric(rawNumber(row.cashVariance)),
      };
    });
  }

  async kitchen(storeId: string, period: AnalyticsPeriod) {
    const rows = await this.prisma.$queryRaw<Array<{
      stationId: string;
      stationName: string;
      ticketCount: bigint | number;
      completedCount: bigint | number;
      lateTicketCount: bigint | number;
      avgQueueSeconds: unknown;
      avgPrepSeconds: unknown;
      avgReadyWaitSeconds: unknown;
      avgTotalSeconds: unknown;
    }>>(Prisma.sql`
      SELECT station.id AS stationId, station.name AS stationName,
        COUNT(ticket.id) AS ticketCount,
        SUM(CASE WHEN ticket.completedAt IS NOT NULL THEN 1 ELSE 0 END) AS completedCount,
        SUM(CASE WHEN ticket.completedAt IS NOT NULL AND TIMESTAMPDIFF(SECOND, ticket.createdAt, ticket.completedAt) > 900 THEN 1 ELSE 0 END) AS lateTicketCount,
        AVG(CASE WHEN ticket.startedAt IS NOT NULL AND ticket.startedAt >= ticket.createdAt THEN TIMESTAMPDIFF(SECOND, ticket.createdAt, ticket.startedAt) END) AS avgQueueSeconds,
        AVG(CASE WHEN ticket.startedAt IS NOT NULL AND ticket.readyAt IS NOT NULL AND ticket.readyAt >= ticket.startedAt THEN TIMESTAMPDIFF(SECOND, ticket.startedAt, ticket.readyAt) END) AS avgPrepSeconds,
        AVG(CASE WHEN ticket.readyAt IS NOT NULL AND ticket.completedAt IS NOT NULL AND ticket.completedAt >= ticket.readyAt THEN TIMESTAMPDIFF(SECOND, ticket.readyAt, ticket.completedAt) END) AS avgReadyWaitSeconds,
        AVG(CASE WHEN ticket.completedAt IS NOT NULL AND ticket.completedAt >= ticket.createdAt THEN TIMESTAMPDIFF(SECOND, ticket.createdAt, ticket.completedAt) END) AS avgTotalSeconds
      FROM KitchenStation station
      LEFT JOIN KitchenTicket ticket ON ticket.stationId = station.id
        AND ticket.storeId = ${storeId}
        AND ticket.createdAt >= ${period.start} AND ticket.createdAt < ${period.end}
        AND ticket.status <> 'CANCELLED'
      WHERE station.storeId = ${storeId}
      GROUP BY station.id, station.name
      ORDER BY ticketCount DESC
    `);
    const minutes = (seconds: unknown) => seconds === null ? null : durationMinutes(new Date(0), new Date(Number(seconds) * 1000));
    return rows.map((row) => ({
      stationId: row.stationId,
      stationName: row.stationName,
      ticketCount: Number(row.ticketCount),
      completedCount: Number(row.completedCount),
      lateTicketCount: Number(row.lateTicketCount),
      avgQueueTimeMinutes: minutes(row.avgQueueSeconds),
      avgPrepTimeMinutes: minutes(row.avgPrepSeconds),
      avgReadyWaitTimeMinutes: minutes(row.avgReadyWaitSeconds),
      avgTotalTimeMinutes: minutes(row.avgTotalSeconds),
    }));
  }
}
