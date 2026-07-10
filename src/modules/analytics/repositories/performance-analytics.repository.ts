import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import { applyCategoryShares, applyProductMetrics, modifierAttachRate, roundMetric } from '../domain/analytics-math';
import type { AnalyticsPeriod, CategoryMetric, ProductMetric } from '../analytics.types';

type ProductRow = {
  productId: string;
  name: string | null;
  category: string | null;
  unitsSold: unknown;
  orderCount: bigint | number;
  grossSales: unknown;
};

type ProductRefundRow = { productId: string; refundAmount: unknown };
const rawNumber = (value: unknown) => Number(value ?? 0);

@Injectable()
export class PerformanceAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async products(input: {
    storeId: string;
    period: AnalyticsPeriod;
    previousPeriod: AnalyticsPeriod;
    totalOrders: number;
    categoryId?: string;
  }): Promise<ProductMetric[]> {
    const [rows, refunds, previousRows, previousRefunds] = await Promise.all([
      this.productRows(input.storeId, input.period, input.categoryId),
      this.productRefundRows(input.storeId, input.period, input.categoryId),
      this.productRows(input.storeId, input.previousPeriod, input.categoryId),
      this.productRefundRows(input.storeId, input.previousPeriod, input.categoryId),
    ]);
    const refundMap = new Map(refunds.map((row) => [row.productId, rawNumber(row.refundAmount)]));
    const previousRefundMap = new Map(previousRefunds.map((row) => [row.productId, rawNumber(row.refundAmount)]));
    const previousSales = new Map(previousRows.map((row) => [row.productId, roundMetric(rawNumber(row.grossSales) - (previousRefundMap.get(row.productId) ?? 0))]));
    return applyProductMetrics({
      rows: rows.map((row) => ({
        productId: row.productId,
        name: row.name ?? 'Unknown product',
        category: row.category ?? 'Uncategorized',
        unitsSold: Number(row.unitsSold),
        orderCount: Number(row.orderCount),
        grossSales: rawNumber(row.grossSales),
      })),
      refunds: refundMap,
      previousSales,
      totalOrders: input.totalOrders,
    });
  }

  async categories(input: { storeId: string; period: AnalyticsPeriod; previousPeriod: AnalyticsPeriod }): Promise<CategoryMetric[]> {
    const [currentProducts, currentRefunds, previousProducts, previousRefunds] = await Promise.all([
      this.productRows(input.storeId, input.period),
      this.productRefundRows(input.storeId, input.period),
      this.productRows(input.storeId, input.previousPeriod),
      this.productRefundRows(input.storeId, input.previousPeriod),
    ]);
    const refundMap = new Map(currentRefunds.map((row) => [row.productId, rawNumber(row.refundAmount)]));
    const previousRefundMap = new Map(previousRefunds.map((row) => [row.productId, rawNumber(row.refundAmount)]));
    const grouped = new Map<string, Omit<CategoryMetric, 'sharePercent' | 'changePercent'>>();
    for (const row of currentProducts) {
      const name = row.category ?? 'Uncategorized';
      const existing = grouped.get(name) ?? { categoryId: null, name, unitsSold: 0, grossSales: 0, refundAmount: 0, netSales: 0 };
      existing.unitsSold += Number(row.unitsSold);
      existing.grossSales = roundMetric(existing.grossSales + rawNumber(row.grossSales));
      existing.refundAmount = roundMetric(existing.refundAmount + (refundMap.get(row.productId) ?? 0));
      existing.netSales = roundMetric(existing.grossSales - existing.refundAmount);
      grouped.set(name, existing);
    }
    const previousSales = new Map<string, number>();
    for (const row of previousProducts) {
      const name = row.category ?? 'Uncategorized';
      previousSales.set(name, roundMetric((previousSales.get(name) ?? 0) + rawNumber(row.grossSales) - (previousRefundMap.get(row.productId) ?? 0)));
    }
    return applyCategoryShares([...grouped.values()], previousSales).sort((a, b) => b.netSales - a.netSales);
  }

  async modifiers(storeId: string, period: AnalyticsPeriod) {
    const [selected, eligible] = await Promise.all([
      this.prisma.$queryRaw<Array<{ optionId: string; name: string; groupName: string; selectionCount: unknown; revenueContribution: unknown }>>(Prisma.sql`
        SELECT selected.optionId, MAX(selected.optionName) AS name, MAX(selected.groupName) AS groupName,
          COUNT(*) AS selectionCount, COALESCE(SUM(selected.priceDelta * oi.quantity), 0) AS revenueContribution
        FROM OrderItem oi
        INNER JOIN \`Order\` o ON o.id = oi.orderId
        INNER JOIN JSON_TABLE(
          COALESCE(oi.modifiers, JSON_ARRAY()), '$[*]' COLUMNS(
            optionId VARCHAR(191) PATH '$.optionId',
            optionName VARCHAR(255) PATH '$.optionName',
            groupName VARCHAR(255) PATH '$.groupName',
            priceDelta DECIMAL(10,2) PATH '$.priceDelta'
          )
        ) selected
        WHERE o.storeId = ${storeId}
          AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND o.paidAt >= ${period.start} AND o.paidAt < ${period.end}
        GROUP BY selected.optionId
      `),
      this.prisma.$queryRaw<Array<{ optionId: string; eligibleProductItemCount: unknown }>>(Prisma.sql`
        SELECT selectedOption.optionId, COALESCE(SUM(eligibleItem.quantity), 0) AS eligibleProductItemCount
        FROM (
          SELECT DISTINCT selected.optionId, sourceItem.productId
          FROM OrderItem sourceItem
          INNER JOIN \`Order\` sourceOrder ON sourceOrder.id = sourceItem.orderId
          INNER JOIN JSON_TABLE(
            COALESCE(sourceItem.modifiers, JSON_ARRAY()), '$[*]' COLUMNS(
              optionId VARCHAR(191) PATH '$.optionId'
            )
          ) selected
          WHERE sourceOrder.storeId = ${storeId}
            AND sourceOrder.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
            AND sourceOrder.paidAt >= ${period.start} AND sourceOrder.paidAt < ${period.end}
        ) selectedOption
        INNER JOIN OrderItem eligibleItem ON eligibleItem.productId = selectedOption.productId
        INNER JOIN \`Order\` eligibleOrder ON eligibleOrder.id = eligibleItem.orderId
        WHERE eligibleOrder.storeId = ${storeId}
          AND eligibleOrder.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND eligibleOrder.paidAt >= ${period.start} AND eligibleOrder.paidAt < ${period.end}
        GROUP BY selectedOption.optionId
      `),
    ]);
    const eligibleMap = new Map(eligible.map((row) => [row.optionId, Number(row.eligibleProductItemCount)]));
    return selected.map((row) => {
      const selectionCount = Number(row.selectionCount);
      const eligibleProductItemCount = eligibleMap.get(row.optionId) ?? 0;
      return {
        optionId: row.optionId,
        name: row.name,
        groupName: row.groupName,
        selectionCount,
        eligibleProductItemCount,
        attachRate: modifierAttachRate(selectionCount, eligibleProductItemCount),
        revenueContribution: roundMetric(rawNumber(row.revenueContribution)),
      };
    }).sort((a, b) => b.selectionCount - a.selectionCount);
  }

  private productRows(storeId: string, period: AnalyticsPeriod, categoryId?: string) {
    return this.prisma.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT oi.productId,
        COALESCE(MAX(oi.productNameSnapshot), MAX(p.name), 'Unknown product') AS name,
        COALESCE(MAX(oi.productCategorySnapshot), MAX(p.category), 'Uncategorized') AS category,
        COALESCE(SUM(oi.quantity), 0) AS unitsSold,
        COUNT(DISTINCT oi.orderId) AS orderCount,
        COALESCE(SUM(oi.lineTotal), 0) AS grossSales
      FROM OrderItem oi
      INNER JOIN \`Order\` o ON o.id = oi.orderId
      LEFT JOIN Product p ON p.id = oi.productId
      WHERE o.storeId = ${storeId}
        AND o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        AND o.paidAt >= ${period.start} AND o.paidAt < ${period.end}
        ${categoryId ? Prisma.sql`AND p.categoryId = ${categoryId}` : Prisma.empty}
      GROUP BY oi.productId
    `);
  }

  private productRefundRows(storeId: string, period: AnalyticsPeriod, categoryId?: string) {
    return this.prisma.$queryRaw<ProductRefundRow[]>(Prisma.sql`
      SELECT oi.productId, COALESCE(SUM(ri.amount), 0) AS refundAmount
      FROM RefundItem ri
      INNER JOIN Refund r ON r.id = ri.refundId
      INNER JOIN OrderItem oi ON oi.id = ri.orderItemId
      LEFT JOIN Product p ON p.id = oi.productId
      WHERE r.storeId = ${storeId} AND r.status = 'COMPLETED'
        AND r.createdAt >= ${period.start} AND r.createdAt < ${period.end}
        ${categoryId ? Prisma.sql`AND p.categoryId = ${categoryId}` : Prisma.empty}
      GROUP BY oi.productId
    `);
  }
}
