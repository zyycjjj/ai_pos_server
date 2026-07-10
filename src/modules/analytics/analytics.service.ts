import { BadRequestException, Injectable } from '@nestjs/common';

import { StoreContextService } from '@/common/store-context.service';

import { buildInsightSignals, compareSalesMetrics } from './domain/analytics-math';
import { AnalyticsPeriodError, comparisonPeriod, resolvePeriod, resolvePresetDates } from './domain/analytics-time';
import type { AnalyticsCompare, AnalyticsPeriod } from './analytics.types';
import type { AnalyticsQueryDto, ProductAnalyticsQueryDto } from './dto/analytics-query.dto';
import { OperationsAnalyticsRepository } from './repositories/operations-analytics.repository';
import { PerformanceAnalyticsRepository } from './repositories/performance-analytics.repository';
import { SalesAnalyticsRepository } from './repositories/sales-analytics.repository';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly sales: SalesAnalyticsRepository,
    private readonly performance: PerformanceAnalyticsRepository,
    private readonly operations: OperationsAnalyticsRepository,
  ) {}

  async overview(query: AnalyticsQueryDto) {
    const context = await this.context(query);
    const [current, previous] = await Promise.all([
      this.sales.metric(context.store.id, context.period),
      this.sales.metric(context.store.id, context.previousPeriod),
    ]);
    return {
      period: this.presentPeriod(context.period),
      comparisonPeriod: this.presentPeriod(context.previousPeriod),
      compare: context.compare,
      currency: context.store.currency,
      current,
      previous,
      comparison: compareSalesMetrics(current, previous),
    };
  }

  async daily(query: AnalyticsQueryDto) {
    const { store, period } = await this.context(query);
    return { period: this.presentPeriod(period), currency: store.currency, metrics: await this.sales.daily(store.id, period) };
  }

  async hourly(query: AnalyticsQueryDto) {
    const { store, period } = await this.context(query);
    return { period: this.presentPeriod(period), currency: store.currency, metrics: await this.sales.hourly(store.id, period) };
  }

  async products(query: ProductAnalyticsQueryDto) {
    const { store, period, previousPeriod } = await this.context(query);
    const current = await this.sales.metric(store.id, period);
    const metrics = await this.performance.products({
      storeId: store.id,
      period,
      previousPeriod,
      totalOrders: current.orderCount,
      categoryId: query.categoryId,
    });
    const sorters = {
      revenue: (a: typeof metrics[number], b: typeof metrics[number]) => b.netSales - a.netSales,
      units: (a: typeof metrics[number], b: typeof metrics[number]) => b.unitsSold - a.unitsSold,
      growth: (a: typeof metrics[number], b: typeof metrics[number]) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity),
      decline: (a: typeof metrics[number], b: typeof metrics[number]) => (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity),
      refunds: (a: typeof metrics[number], b: typeof metrics[number]) => b.refundAmount - a.refundAmount,
    };
    return { period: this.presentPeriod(period), currency: store.currency, metrics: metrics.sort(sorters[query.sort]).slice(0, query.limit) };
  }

  async categories(query: AnalyticsQueryDto) {
    const { store, period, previousPeriod } = await this.context(query);
    return { period: this.presentPeriod(period), currency: store.currency, metrics: await this.performance.categories({ storeId: store.id, period, previousPeriod }) };
  }

  async modifiers(query: AnalyticsQueryDto) {
    const { store, period } = await this.context(query);
    return { period: this.presentPeriod(period), currency: store.currency, metrics: await this.performance.modifiers(store.id, period) };
  }

  async refunds(query: AnalyticsQueryDto) {
    const { store, period } = await this.context(query);
    const metric = await this.sales.metric(store.id, period);
    return { period: this.presentPeriod(period), currency: store.currency, ...(await this.operations.refunds(store.id, period, metric.grossSales, metric.paidOrderCount)) };
  }

  async shifts(query: AnalyticsQueryDto) {
    const { store, period } = await this.context(query);
    return { period: this.presentPeriod(period), currency: store.currency, metrics: await this.operations.shifts(store.id, period) };
  }

  async kitchen(query: AnalyticsQueryDto) {
    const { store, period } = await this.context(query);
    return { period: this.presentPeriod(period), metrics: await this.operations.kitchen(store.id, period) };
  }

  async payments(query: AnalyticsQueryDto) {
    const { store, period } = await this.context(query);
    return { period: this.presentPeriod(period), currency: store.currency, metrics: await this.sales.paymentMix(store.id, period) };
  }

  async signals(query: AnalyticsQueryDto) {
    const data = await this.signalData(query);
    return { period: this.presentPeriod(data.period), signals: data.signals };
  }

  async aiContext(query: AnalyticsQueryDto) {
    const context = await this.context(query);
    const [current, previous, daily, hourly, products, categories, modifiers, shifts, kitchen, payments] = await Promise.all([
      this.sales.metric(context.store.id, context.period),
      this.sales.metric(context.store.id, context.previousPeriod),
      this.sales.daily(context.store.id, context.period),
      this.sales.hourly(context.store.id, context.period),
      this.performance.products({ storeId: context.store.id, period: context.period, previousPeriod: context.previousPeriod, totalOrders: 0 }),
      this.performance.categories({ storeId: context.store.id, period: context.period, previousPeriod: context.previousPeriod }),
      this.performance.modifiers(context.store.id, context.period),
      this.operations.shifts(context.store.id, context.period),
      this.operations.kitchen(context.store.id, context.period),
      this.sales.paymentMix(context.store.id, context.period),
    ]);
    const [refunds, previousRefunds] = await Promise.all([
      this.operations.refunds(context.store.id, context.period, current.grossSales, current.paidOrderCount),
      this.operations.refunds(context.store.id, context.previousPeriod, previous.grossSales, previous.paidOrderCount),
    ]);
    const rankedProducts = products.map((product) => ({ ...product, orderPenetration: current.orderCount === 0 ? 0 : Math.round((product.orderCount / current.orderCount) * 10_000) / 10_000 }));
    const signals = buildInsightSignals({ current, previous, products: rankedProducts, refundRate: refunds.refundRate, previousRefundRate: previousRefunds.refundRate, shifts, kitchen });
    return {
      store: context.store,
      period: this.presentPeriod(context.period),
      comparisonPeriod: this.presentPeriod(context.previousPeriod),
      overview: current,
      comparison: compareSalesMetrics(current, previous),
      daily,
      hourly,
      topProducts: [...rankedProducts].sort((a, b) => b.netSales - a.netSales).slice(0, 10),
      decliningProducts: rankedProducts.filter((item) => (item.changePercent ?? 0) < 0).sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0)).slice(0, 10),
      categories: categories.slice(0, 10),
      modifiers: modifiers.slice(0, 20),
      refunds,
      shifts: shifts.slice(0, 10),
      kitchen: kitchen.slice(0, 10),
      payments,
      signals,
      coverage: { sales: true, products: true, modifiers: true, refunds: true, shifts: true, kitchen: true, payments: true, inventory: false },
    };
  }

  private async signalData(query: AnalyticsQueryDto) {
    const context = await this.context(query);
    const [current, previous, products, shifts, kitchen] = await Promise.all([
      this.sales.metric(context.store.id, context.period),
      this.sales.metric(context.store.id, context.previousPeriod),
      this.performance.products({ storeId: context.store.id, period: context.period, previousPeriod: context.previousPeriod, totalOrders: 0 }),
      this.operations.shifts(context.store.id, context.period),
      this.operations.kitchen(context.store.id, context.period),
    ]);
    const [refunds, previousRefunds] = await Promise.all([
      this.operations.refunds(context.store.id, context.period, current.grossSales, current.paidOrderCount),
      this.operations.refunds(context.store.id, context.previousPeriod, previous.grossSales, previous.paidOrderCount),
    ]);
    return { period: context.period, signals: buildInsightSignals({ current, previous, products, refundRate: refunds.refundRate, previousRefundRate: previousRefunds.refundRate, shifts, kitchen }) };
  }

  private async context(query: AnalyticsQueryDto) {
    const storeId = this.storeContext.getStoreId();
    const store = await this.sales.getStore(storeId);
    try {
      const presetDates = query.preset ? resolvePresetDates(query.preset, store.timezone) : undefined;
      const period = resolvePeriod({ from: query.from ?? presetDates?.from, to: query.to ?? presetDates?.to, timezone: store.timezone });
      const compare = (query.compare ?? 'previous_period') as AnalyticsCompare;
      return { store, period, compare, previousPeriod: comparisonPeriod(period, compare) };
    } catch (error) {
      if (error instanceof AnalyticsPeriodError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private presentPeriod(period: AnalyticsPeriod) {
    return { from: period.from, to: period.to, timezone: period.timezone };
  }
}
