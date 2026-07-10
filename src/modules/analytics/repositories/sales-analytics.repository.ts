import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, RefundStatus } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import { buildSalesMetric, roundMetric } from '../domain/analytics-math';
import { dateBuckets, hourBuckets } from '../domain/analytics-time';
import type { AnalyticsPeriod, SalesMetric } from '../analytics.types';

const PAID_STATUSES = [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED];

type BucketRow = { bucket: string | number; grossSales: unknown; orderCount: bigint | number; unitsSold: unknown };
type RefundBucketRow = { bucket: string | number; refundTotal: unknown };
const rawNumber = (value: unknown) => Number(value ?? 0);

@Injectable()
export class SalesAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getStore(storeId: string) {
    return this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { id: true, name: true, timezone: true, currency: true },
    });
  }

  async metric(storeId: string, period: AnalyticsPeriod): Promise<SalesMetric> {
    const orderWhere: Prisma.OrderWhereInput = {
      storeId,
      status: { in: PAID_STATUSES },
      paidAt: { gte: period.start, lt: period.end },
    };
    const [orders, refunds, items] = await Promise.all([
      this.prisma.order.aggregate({ where: orderWhere, _sum: { total: true }, _count: true }),
      this.prisma.refund.aggregate({
        where: { storeId, status: RefundStatus.COMPLETED, createdAt: { gte: period.start, lt: period.end } },
        _sum: { amount: true },
      }),
      this.prisma.orderItem.aggregate({ where: { order: orderWhere }, _sum: { quantity: true } }),
    ]);
    return buildSalesMetric({
      grossSales: toMoneyNumber(orders._sum.total ?? 0),
      refundTotal: toMoneyNumber(refunds._sum.amount ?? 0),
      orderCount: orders._count,
      unitsSold: items._sum.quantity ?? 0,
    });
  }

  async daily(storeId: string, period: AnalyticsPeriod) {
    return this.bucketed(storeId, period, 'date');
  }

  async hourly(storeId: string, period: AnalyticsPeriod) {
    const rows = await this.bucketed(storeId, period, 'hour');
    return Array.from({ length: 24 }, (_, hour) => {
      const matching = rows.find((row) => 'hour' in row && Number(row.hour) === hour);
      return matching ?? { hour, grossSales: 0, refundTotal: 0, netSales: 0, orderCount: 0, averageTicket: 0, unitsSold: 0 };
    });
  }

  async paymentMix(storeId: string, period: AnalyticsPeriod) {
    const rows = await this.prisma.$queryRaw<Array<{ method: string; amount: unknown }>>(Prisma.sql`
      SELECT op.method, COALESCE(SUM(op.amount), 0) AS amount
      FROM OrderPayment op
      INNER JOIN \`Order\` o ON o.id = op.orderId
      WHERE o.storeId = ${storeId}
        AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND o.paidAt >= ${period.start} AND o.paidAt < ${period.end}
      GROUP BY op.method
    `);
    const total = rows.reduce((sum, row) => sum + rawNumber(row.amount), 0);
    return rows.map((row) => ({
      method: row.method,
      amount: roundMetric(rawNumber(row.amount)),
      sharePercent: total === 0 ? 0 : roundMetric((rawNumber(row.amount) / total) * 100, 1),
    }));
  }

  private async bucketed(storeId: string, period: AnalyticsPeriod, kind: 'date' | 'hour') {
    const buckets: Array<{ label: string; start: Date; end: Date; hour?: number }> = kind === 'date' ? dateBuckets(period) : hourBuckets(period);
    const cases = buckets.map((bucket) => Prisma.sql`WHEN o.paidAt >= ${bucket.start} AND o.paidAt < ${bucket.end} THEN ${kind === 'date' ? bucket.label : bucket.hour ?? 0}`);
    const refundCases = buckets.map((bucket) => Prisma.sql`WHEN r.createdAt >= ${bucket.start} AND r.createdAt < ${bucket.end} THEN ${kind === 'date' ? bucket.label : bucket.hour ?? 0}`);
    const [salesRows, refundRows] = await Promise.all([
      this.prisma.$queryRaw<BucketRow[]>(Prisma.sql`
        SELECT CASE ${Prisma.join(cases, ' ')} END AS bucket,
          COALESCE(SUM(o.total), 0) AS grossSales,
          COUNT(DISTINCT o.id) AS orderCount,
          COALESCE(SUM(oi.unitsSold), 0) AS unitsSold
        FROM \`Order\` o
        LEFT JOIN (
          SELECT orderId, SUM(quantity) AS unitsSold
          FROM OrderItem
          GROUP BY orderId
        ) oi ON oi.orderId = o.id
        WHERE o.storeId = ${storeId}
          AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND o.paidAt >= ${period.start} AND o.paidAt < ${period.end}
        GROUP BY bucket
      `),
      this.prisma.$queryRaw<RefundBucketRow[]>(Prisma.sql`
        SELECT CASE ${Prisma.join(refundCases, ' ')} END AS bucket,
          COALESCE(SUM(r.amount), 0) AS refundTotal
        FROM Refund r
        WHERE r.storeId = ${storeId} AND r.status = 'COMPLETED'
          AND r.createdAt >= ${period.start} AND r.createdAt < ${period.end}
        GROUP BY bucket
      `),
    ]);
    const refunds = new Map(refundRows.map((row) => [String(row.bucket), rawNumber(row.refundTotal)]));
    const sales = new Map(salesRows.map((row) => [String(row.bucket), row]));
    const keys = kind === 'date' ? buckets.map((bucket) => bucket.label) : Array.from({ length: 24 }, (_, hour) => String(hour));
    return keys.map((key) => {
      const row = sales.get(key);
      const grossSales = rawNumber(row?.grossSales);
      const refundTotal = refunds.get(key) ?? 0;
      const orderCount = Number(row?.orderCount ?? 0);
      return {
        ...(kind === 'date' ? { date: key } : { hour: Number(key) }),
        grossSales: roundMetric(grossSales),
        refundTotal: roundMetric(refundTotal),
        netSales: roundMetric(grossSales - refundTotal),
        orderCount,
        averageTicket: orderCount === 0 ? 0 : roundMetric((grossSales - refundTotal) / orderCount),
        unitsSold: Number(row?.unitsSold ?? 0),
      };
    });
  }
}
