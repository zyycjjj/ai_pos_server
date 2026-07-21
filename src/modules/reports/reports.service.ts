import { BadRequestException, Injectable } from '@nestjs/common';
import { CashMovementType, LoyaltyPointLedgerType } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';

import { csvResponse } from './csv-exporter';
import { ReportExportType, ReportRangeQuery, resolveReportLimit, resolveReportRange } from './report-range';
import { ReportsRepository, type ReportOrder, type ReportRefund, type ReportShift } from './reports.repository';
import type { CampaignReportItem, CustomerReportItem, ItemsReport, PaymentReportItem, ProductReportItem, ReportsSummary, ShiftReportItem } from './reports.types';

@Injectable()
export class ReportsService {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly repository: ReportsRepository,
  ) {}

  async summary(query: ReportRangeQuery): Promise<ReportsSummary> {
    const context = await this.context(query);
    const [orders, refunds, customers, campaigns, customerCampaigns, shifts] = await Promise.all([
      this.repository.orders(context.storeId, context.range),
      this.repository.refunds(context.storeId, context.range),
      this.repository.customers(context.storeId, context.range),
      this.repository.campaigns(context.storeId),
      this.repository.activeCustomerCampaigns(context.storeId),
      this.repository.shifts(context.storeId, context.range),
    ]);
    const sales = this.salesSummary(orders, refunds);
    const activeCustomerIds = new Set(orders.filter((order) => order.customerId).map((order) => order.customerId));
    const repeatCustomers = customers.filter((customer) => customer.orderCount > 1 && customer.lastOrderAt && customer.lastOrderAt >= context.range.start && customer.lastOrderAt <= context.range.end).length;
    const closedShifts = shifts.filter((shift) => shift.status === 'CLOSED');
    return {
      range: this.presentRange(context.range),
      currency: context.currency,
      sales,
      customers: {
        customerCount: customers.length,
        newCustomers: customers.filter((customer) => customer.createdAt >= context.range.start && customer.createdAt <= context.range.end).length,
        repeatCustomers,
        repeatPurchaseRate: activeCustomerIds.size === 0 ? 0 : roundRatio(repeatCustomers / activeCustomerIds.size),
      },
      campaigns: {
        campaignUsageCount: campaigns.reduce((sum, campaign) => sum + campaign.usageCount, 0),
        campaignDiscountTotal: money(campaigns.reduce((sum, campaign) => sum + toMoneyNumber(campaign.discountTotal), 0)),
        customerCampaignUsageCount: customerCampaigns.reduce((sum, campaign) => sum + campaign.usageCount, 0),
        customerCampaignDiscountTotal: money(customerCampaigns.reduce((sum, campaign) => sum + toMoneyNumber(campaign.discountTotal), 0)),
      },
      shifts: {
        closedShiftCount: closedShifts.length,
        cashExpectedTotal: money(closedShifts.reduce((sum, shift) => sum + toMoneyNumber(shift.expectedCash), 0)),
        cashActualTotal: money(closedShifts.reduce((sum, shift) => sum + (shift.actualCash ? toMoneyNumber(shift.actualCash) : 0), 0)),
        cashVarianceTotal: money(closedShifts.reduce((sum, shift) => sum + (shift.variance ? toMoneyNumber(shift.variance) : 0), 0)),
      },
    };
  }

  async sales(query: ReportRangeQuery) {
    const context = await this.context(query);
    const [orders, refunds] = await Promise.all([this.repository.orders(context.storeId, context.range), this.repository.refunds(context.storeId, context.range)]);
    return { range: this.presentRange(context.range), currency: context.currency, ...this.salesSummary(orders, refunds) };
  }

  async products(query: ReportRangeQuery): Promise<ItemsReport<ProductReportItem>> {
    const context = await this.context(query);
    const [orders, refunds] = await Promise.all([this.repository.orders(context.storeId, context.range), this.repository.refunds(context.storeId, context.range)]);
    const refundsByItem = refundItemsByOrderItem(refunds);
    const byProduct = new Map<string, ProductReportItem>();
    for (const order of orders) {
      for (const item of order.items) {
        const current = byProduct.get(item.productId) ?? {
          productId: item.productId,
          name: item.productNameSnapshot ?? item.productId,
          quantitySold: 0,
          grossSales: 0,
          netSales: 0,
          refundQuantity: 0,
          refundAmount: 0,
        };
        const refunded = refundsByItem.get(item.id) ?? { quantity: 0, amount: 0 };
        current.quantitySold += item.quantity;
        current.grossSales = money(current.grossSales + toMoneyNumber(item.lineTotal));
        current.refundQuantity += refunded.quantity;
        current.refundAmount = money(current.refundAmount + refunded.amount);
        current.netSales = money(current.grossSales - current.refundAmount);
        byProduct.set(item.productId, current);
      }
    }
    return this.items(context, [...byProduct.values()].sort((a, b) => b.netSales - a.netSales).slice(0, resolveReportLimit(query.limit)));
  }

  async customers(query: ReportRangeQuery): Promise<ItemsReport<CustomerReportItem>> {
    const context = await this.context(query);
    const [orders, refunds, ledgers] = await Promise.all([
      this.repository.orders(context.storeId, context.range),
      this.repository.refunds(context.storeId, context.range),
      this.repository.pointLedgers(context.storeId, context.range),
    ]);
    const refundByOrder = refundAmountByOrder(refunds);
    const ledgerByCustomer = new Map<string, { earned: number; adjusted: number }>();
    for (const ledger of ledgers) {
      const current = ledgerByCustomer.get(ledger.customerId) ?? { earned: 0, adjusted: 0 };
      if (ledger.type === LoyaltyPointLedgerType.EARN) current.earned += ledger.points;
      if (ledger.type === LoyaltyPointLedgerType.ADJUST || ledger.type === LoyaltyPointLedgerType.REFUND_ADJUST || ledger.type === LoyaltyPointLedgerType.VOID) current.adjusted += ledger.points;
      ledgerByCustomer.set(ledger.customerId, current);
    }
    const byCustomer = new Map<string, CustomerReportItem>();
    for (const order of orders) {
      if (!order.customerId) continue;
      const current = byCustomer.get(order.customerId) ?? {
        customerId: order.customerId,
        name: order.customerNameSnapshot ?? order.customer?.name ?? null,
        phone: order.customerPhoneSnapshot ?? order.customer?.phone ?? null,
        orderCount: 0,
        netSales: 0,
        pointsEarned: 0,
        pointsAdjusted: 0,
        lastOrderAt: null,
      };
      current.orderCount += 1;
      current.netSales = money(current.netSales + toMoneyNumber(order.total) - (refundByOrder.get(order.id) ?? 0));
      current.lastOrderAt = maxIso(current.lastOrderAt, order.paidAt?.toISOString() ?? order.createdAt.toISOString());
      byCustomer.set(order.customerId, current);
    }
    for (const item of byCustomer.values()) {
      const ledger = ledgerByCustomer.get(item.customerId);
      item.pointsEarned = ledger?.earned ?? 0;
      item.pointsAdjusted = ledger?.adjusted ?? 0;
    }
    return this.items(context, [...byCustomer.values()].sort((a, b) => b.netSales - a.netSales).slice(0, resolveReportLimit(query.limit)));
  }

  async campaigns(query: ReportRangeQuery): Promise<ItemsReport<CampaignReportItem>> {
    const context = await this.context(query);
    const [orders, campaigns] = await Promise.all([this.repository.orders(context.storeId, context.range), this.repository.campaigns(context.storeId)]);
    const byCampaign = new Map<string, { orderCount: number; discountTotal: number }>();
    for (const order of orders) {
      for (const promotion of readAppliedPromotions(order.appliedPromotions)) {
        const id = promotion.campaignId ?? promotion.id;
        if (!id) continue;
        const current = byCampaign.get(id) ?? { orderCount: 0, discountTotal: 0 };
        current.orderCount += 1;
        current.discountTotal = money(current.discountTotal + Number(promotion.discountAmount ?? 0));
        byCampaign.set(id, current);
      }
    }
    const items = campaigns.map((campaign) => {
      const usage = byCampaign.get(campaign.id);
      return {
        campaignId: campaign.id,
        name: campaign.name,
        type: campaign.type,
        customerEligibilityMode: campaign.customerEligibilityMode,
        targetSegmentName: campaign.targetCustomerSegment?.name ?? null,
        usageCount: usage?.orderCount ?? 0,
        discountTotal: usage?.discountTotal ?? 0,
        orderCount: usage?.orderCount ?? 0,
      };
    }).filter((campaign) => campaign.orderCount > 0 || campaign.discountTotal > 0 || campaign.usageCount > 0);
    return this.items(context, items.sort((a, b) => b.discountTotal - a.discountTotal).slice(0, resolveReportLimit(query.limit)));
  }

  async payments(query: ReportRangeQuery): Promise<ItemsReport<PaymentReportItem>> {
    const context = await this.context(query);
    const [orders, refunds] = await Promise.all([this.repository.orders(context.storeId, context.range), this.repository.refunds(context.storeId, context.range)]);
    const byMethod = new Map<string, PaymentReportItem>();
    for (const order of orders) {
      const methods = new Set(order.payments.map((payment) => payment.method));
      for (const payment of order.payments) {
        const current = byMethod.get(payment.method) ?? { method: payment.method, orderCount: 0, paymentAmount: 0, refundAmount: 0, netAmount: 0 };
        current.paymentAmount = money(current.paymentAmount + toMoneyNumber(payment.amount));
        current.orderCount += methods.has(payment.method) ? 1 : 0;
        byMethod.set(payment.method, current);
      }
    }
    for (const refund of refunds) {
      const current = byMethod.get(refund.method) ?? { method: refund.method, orderCount: 0, paymentAmount: 0, refundAmount: 0, netAmount: 0 };
      current.refundAmount = money(current.refundAmount + toMoneyNumber(refund.amount));
      byMethod.set(refund.method, current);
    }
    for (const item of byMethod.values()) {
      item.netAmount = money(item.paymentAmount - item.refundAmount);
    }
    return this.items(context, [...byMethod.values()].sort((a, b) => b.netAmount - a.netAmount));
  }

  async shifts(query: ReportRangeQuery): Promise<ItemsReport<ShiftReportItem>> {
    const context = await this.context(query);
    const shifts = await this.repository.shifts(context.storeId, context.range);
    return this.items(context, shifts.map((shift) => this.presentShift(shift)));
  }

  async export(type: ReportExportType, query: ReportRangeQuery) {
    const report = await this.reportByType(type, query);
    return csvResponse(this.rowsForExport(type, report));
  }

  async reportSummaryContext(query: ReportRangeQuery) {
    const [summary, products, customers, campaigns, shifts] = await Promise.all([
      this.summary(query),
      this.products({ ...query, limit: 5 }),
      this.customers({ ...query, limit: 5 }),
      this.campaigns({ ...query, limit: 5 }),
      this.shifts(query),
    ]);
    return {
      range: summary.range,
      netSales: summary.sales.netSales,
      refundTotal: summary.sales.refundTotal,
      orderCount: summary.sales.orderCount,
      averageOrderValue: summary.sales.averageOrderValue,
      repeatCustomers: summary.customers.repeatCustomers,
      campaignDiscountTotal: summary.campaigns.campaignDiscountTotal,
      cashVariance: summary.shifts.cashVarianceTotal,
      topProducts: products.items,
      topCustomers: customers.items,
      topCampaigns: campaigns.items,
      closedShifts: shifts.items.length,
    };
  }

  private async reportByType(type: ReportExportType, query: ReportRangeQuery) {
    if (type === 'summary') return this.summary(query);
    if (type === 'products') return this.products(query);
    if (type === 'customers') return this.customers(query);
    if (type === 'campaigns') return this.campaigns(query);
    if (type === 'payments') return this.payments(query);
    if (type === 'shifts') return this.shifts(query);
    throw new BadRequestException('Unsupported report export type.');
  }

  private rowsForExport(type: ReportExportType, report: any): Array<Record<string, unknown>> {
    if (type !== 'summary') return report.items;
    return [
      { section: 'sales', ...report.sales },
      { section: 'customers', ...report.customers },
      { section: 'campaigns', ...report.campaigns },
      { section: 'shifts', ...report.shifts },
    ];
  }

  private salesSummary(orders: ReportOrder[], refunds: ReportRefund[]) {
    const grossSales = money(orders.reduce((sum, order) => sum + toMoneyNumber(order.total), 0));
    const promotionDiscountTotal = money(orders.reduce((sum, order) => sum + toMoneyNumber(order.promotionDiscountAmount), 0));
    const manualDiscountTotal = money(orders.reduce((sum, order) => sum + toMoneyNumber(order.manualDiscountAmount), 0));
    const refundTotal = money(refunds.reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0));
    const netSales = money(grossSales - refundTotal);
    return {
      grossSales,
      netSales,
      refundTotal,
      discountTotal: money(promotionDiscountTotal + manualDiscountTotal),
      promotionDiscountTotal,
      manualDiscountTotal,
      orderCount: orders.length,
      averageOrderValue: orders.length === 0 ? 0 : money(netSales / orders.length),
    };
  }

  private presentShift(shift: ReportShift): ShiftReportItem {
    const movement = movementSummary(shift);
    return {
      shiftId: shift.id,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      openedBy: shift.openedBy?.name ?? shift.user.name ?? shift.user.email,
      closedBy: shift.closedBy?.name ?? shift.closedBy?.email ?? null,
      cashExpected: toMoneyNumber(shift.expectedCash),
      cashActual: shift.actualCash ? toMoneyNumber(shift.actualCash) : null,
      cashVariance: shift.variance ? toMoneyNumber(shift.variance) : null,
      cashIn: movement.cashIn,
      cashOut: movement.cashOut,
      cashSales: movement.cashSales,
      cashRefunds: movement.cashRefunds,
    };
  }

  private async context(query: ReportRangeQuery) {
    const storeId = this.storeContext.getStoreId();
    const range = resolveReportRange(query);
    const store = await this.repository.getStore(storeId);
    return { storeId, range, currency: store.currency };
  }

  private items<T>(context: { range: any; currency: string }, items: T[]): ItemsReport<T> {
    return { range: this.presentRange(context.range), currency: context.currency, items };
  }

  private presentRange(range: ReturnType<typeof resolveReportRange>) {
    return { from: range.from, to: range.to, timezone: range.timezone, preset: range.preset };
  }
}

function refundItemsByOrderItem(refunds: ReportRefund[]) {
  const map = new Map<string, { quantity: number; amount: number }>();
  for (const refund of refunds) {
    for (const item of refund.items) {
      const current = map.get(item.orderItemId) ?? { quantity: 0, amount: 0 };
      current.quantity += item.quantity;
      current.amount = money(current.amount + toMoneyNumber(item.amount));
      map.set(item.orderItemId, current);
    }
  }
  return map;
}

function refundAmountByOrder(refunds: ReportRefund[]) {
  const map = new Map<string, number>();
  for (const refund of refunds) {
    map.set(refund.orderId, money((map.get(refund.orderId) ?? 0) + toMoneyNumber(refund.amount)));
  }
  return map;
}

function readAppliedPromotions(value: unknown): Array<{ id?: string; campaignId?: string; discountAmount?: number }> {
  return Array.isArray(value) ? value as Array<{ id?: string; campaignId?: string; discountAmount?: number }> : [];
}

function movementSummary(shift: ReportShift) {
  const summary = { cashIn: 0, cashOut: 0, cashSales: 0, cashRefunds: 0 };
  for (const movement of shift.movements) {
    const amount = toMoneyNumber(movement.amount);
    if (movement.type === CashMovementType.CASH_IN) summary.cashIn = money(summary.cashIn + amount);
    if (movement.type === CashMovementType.CASH_OUT) summary.cashOut = money(summary.cashOut + amount);
    if (movement.type === CashMovementType.SALE) summary.cashSales = money(summary.cashSales + amount);
    if (movement.type === CashMovementType.REFUND) summary.cashRefunds = money(summary.cashRefunds + amount);
  }
  return summary;
}

function maxIso(current: string | null, candidate: string) {
  return !current || candidate > current ? candidate : current;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
