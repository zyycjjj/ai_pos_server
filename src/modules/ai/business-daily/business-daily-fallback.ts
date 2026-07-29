import { Injectable } from '@nestjs/common';
import { CashMovementType, KitchenTicketStatus, OrderAuditAction } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';

import { EvidenceBuilder } from './business-daily-evidence';
import type { BusinessDailyRawData } from './business-daily.repository';
import type { BusinessDailyMetrics, BusinessDailyRecommendation, BusinessDailyReport, BusinessDailyRange } from './business-daily.types';

@Injectable()
export class BusinessDailyFallback {
  generate(range: BusinessDailyRange, raw: BusinessDailyRawData, input: { generatedBy: string; providerLabel: string; fallback: boolean }): BusinessDailyReport {
    const evidence = new EvidenceBuilder();
    const metrics = this.buildMetrics(raw, range);
    const salesEvidence = evidence.add('METRIC', 'Net sales', metrics.sales.netSales, { orderCount: metrics.sales.orderCount, grossSales: metrics.sales.grossSales });
    const discountEvidence = evidence.add('DISCOUNT', 'Discount total', metrics.sales.discountTotal, { manual: metrics.sales.manualDiscountTotal, promotion: metrics.sales.promotionDiscountTotal });
    const refundEvidence = evidence.add('REFUND', 'Refund total', metrics.refundApproval.refundTotal, { refundCount: metrics.refundApproval.refundCount });
    const kitchenEvidence = evidence.add('KITCHEN', 'Kitchen ticket health', metrics.kitchen.ticketCount, { overdueTicketCount: metrics.kitchen.overdueTicketCount, urgentTicketCount: metrics.kitchen.urgentTicketCount });
    const tableEvidence = evidence.add('TABLE', 'Table orders', metrics.table.tableOrderCount, { dineInOrderCount: metrics.table.dineInOrderCount, averageTableDuration: metrics.table.averageTableDuration });
    const approvalEvidence = evidence.add('APPROVAL', 'Manager approvals', metrics.refundApproval.managerApprovalCount, { voidCount: metrics.refundApproval.voidCount, cashOutCount: metrics.refundApproval.cashOutCount });

    for (const product of metrics.product.topProducts.slice(0, 3)) {
      evidence.add('PRODUCT', `Top product: ${product.name}`, product.netSales, { quantitySold: product.quantitySold }, product.productId);
    }
    for (const customer of metrics.customer.topCustomers.slice(0, 3)) {
      evidence.add('CUSTOMER', `Top customer: ${customer.name ?? customer.phone}`, customer.totalSpend, { orderCount: customer.orderCount }, customer.customerId);
    }
    for (const campaign of metrics.campaign.topCampaigns.slice(0, 3)) {
      evidence.add('CAMPAIGN', `Top campaign: ${campaign.name}`, campaign.discountTotal, { usageCount: campaign.usageCount }, campaign.campaignId);
    }

    const recommendations = this.recommend(metrics, { salesEvidence, discountEvidence, refundEvidence, kitchenEvidence, tableEvidence, approvalEvidence });
    const highlights = this.highlights(metrics, salesEvidence, kitchenEvidence, tableEvidence);
    const risks = this.risks(metrics, refundEvidence, discountEvidence, kitchenEvidence, approvalEvidence);
    const summaryText = metrics.sales.orderCount === 0
      ? 'data_insufficient: No paid orders were found in this range, so the daily summary is limited to setup and operational signals.'
      : `Net sales were ${metrics.sales.netSales.toFixed(2)} from ${metrics.sales.orderCount} paid orders. Refunds were ${metrics.sales.refundTotal.toFixed(2)} and discounts were ${metrics.sales.discountTotal.toFixed(2)}.`;

    return {
      range: { from: range.from, to: range.to, timezone: range.timezone, preset: range.preset },
      summary: { text: summaryText, evidenceIds: [salesEvidence] },
      highlights,
      risks,
      metrics,
      evidence: evidence.all(),
      recommendations,
      generatedBy: input.generatedBy || input.providerLabel,
      fallback: input.fallback,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildMetrics(raw: BusinessDailyRawData, range: BusinessDailyRange): BusinessDailyMetrics {
    const orders = raw.orders;
    const grossSales = money(orders.reduce((sum, order) => sum + toMoneyNumber(order.subtotal), 0));
    const refundTotal = money(raw.refunds.reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0));
    const promotionDiscountTotal = money(orders.reduce((sum, order) => sum + toMoneyNumber(order.promotionDiscountAmount), 0));
    const manualDiscountTotal = money(orders.reduce((sum, order) => sum + toMoneyNumber(order.manualDiscountAmount), 0));
    const discountTotal = money(promotionDiscountTotal + manualDiscountTotal);
    const netSales = money(orders.reduce((sum, order) => sum + toMoneyNumber(order.total), 0) - refundTotal);
    const orderCount = orders.length;

    const byProduct = new Map<string, { productId: string; name: string; quantitySold: number; netSales: number; modifierUsageCount: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const row = byProduct.get(item.productId) ?? { productId: item.productId, name: item.productNameSnapshot ?? item.productId, quantitySold: 0, netSales: 0, modifierUsageCount: 0 };
        row.quantitySold += item.quantity;
        row.netSales = money(row.netSales + toMoneyNumber(item.lineTotal));
        row.modifierUsageCount += Array.isArray(item.modifiers) ? item.modifiers.length : 0;
        byProduct.set(item.productId, row);
      }
    }
    const productRows = [...byProduct.values()];
    const topProducts = productRows.sort((a, b) => b.netSales - a.netSales).slice(0, 5);
    const lowSellingProducts = raw.products
      .map((product) => productRows.find((row) => row.productId === product.id) ?? { productId: product.id, name: product.name, quantitySold: 0, netSales: 0 })
      .sort((a, b) => a.quantitySold - b.quantitySold || a.netSales - b.netSales)
      .slice(0, 5);

    const repeatCustomerIds = new Set(orders.filter((order) => order.customer && order.customer.orderCount > 1).map((order) => order.customerId).filter(Boolean));
    const customerOrders = orders.filter((order) => order.customerId).length;
    const newCustomerCount = raw.customers.filter((customer) => customer.createdAt >= range.start && customer.createdAt <= range.end).length;
    const topCustomers = raw.customers.slice(0, 5).map((customer) => ({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      totalSpend: toMoneyNumber(customer.totalSpend),
      orderCount: customer.orderCount,
    }));
    const dormantCustomers = raw.customers
      .filter((customer) => customer.lastOrderAt && customer.lastOrderAt < dormantCutoff())
      .slice(0, 5)
      .map((customer) => ({ customerId: customer.id, name: customer.name, phone: customer.phone, lastOrderAt: customer.lastOrderAt?.toISOString() ?? null }));

    const campaignsNearUsageLimit = raw.campaigns
      .filter((campaign) => campaign.usageLimit && campaign.usageCount >= Math.max(1, Math.floor(campaign.usageLimit * 0.8)))
      .map((campaign) => ({ campaignId: campaign.id, name: campaign.name, usageCount: campaign.usageCount, usageLimit: campaign.usageLimit ?? 0 }));

    const kitchenDurations = raw.kitchenTickets.map((ticket) => ({
      wait: ticket.startedAt ? minutesBetween(ticket.createdAt, ticket.startedAt) : null,
      cook: ticket.readyAt && ticket.startedAt ? minutesBetween(ticket.startedAt, ticket.readyAt) : null,
      overdue: !ticket.readyAt && minutesBetween(ticket.createdAt, new Date()) > ticket.station.overdueMinutes,
    }));
    const overdueByStation = new Map<string, { stationId: string; name: string; overdueTicketCount: number }>();
    for (const ticket of raw.kitchenTickets) {
      const overdue = !ticket.readyAt && minutesBetween(ticket.createdAt, new Date()) > ticket.station.overdueMinutes;
      if (!overdue) continue;
      const row = overdueByStation.get(ticket.stationId) ?? { stationId: ticket.stationId, name: ticket.station.name, overdueTicketCount: 0 };
      row.overdueTicketCount += 1;
      overdueByStation.set(ticket.stationId, row);
    }

    const tableOrders = orders.filter((order) => order.orderType === 'DINE_IN' || order.tableId);
    const byTable = new Map<string, { tableId: string; name: string; sales: number; orderCount: number }>();
    for (const order of tableOrders) {
      if (!order.tableId) continue;
      const row = byTable.get(order.tableId) ?? { tableId: order.tableId, name: order.table?.name ?? order.tableId, sales: 0, orderCount: 0 };
      row.sales = money(row.sales + toMoneyNumber(order.total));
      row.orderCount += 1;
      byTable.set(order.tableId, row);
    }

    const approvals = raw.auditLogs.filter((log) => log.approvedById || log.action === OrderAuditAction.MANAGER_APPROVAL);
    return {
      sales: {
        grossSales,
        netSales,
        refundTotal,
        discountTotal,
        promotionDiscountTotal,
        manualDiscountTotal,
        orderCount,
        averageOrderValue: orderCount > 0 ? money(netSales / orderCount) : 0,
      },
      product: {
        topProducts,
        lowSellingProducts,
        soldOutProducts: raw.soldOutProducts.slice(0, 10).map((product) => ({ productId: product.id, name: product.name })),
        inactiveProducts: raw.inactiveProducts.slice(0, 10).map((product) => ({ productId: product.id, name: product.name })),
        productsWithHighModifierUsage: productRows.filter((product) => product.modifierUsageCount > 0).sort((a, b) => b.modifierUsageCount - a.modifierUsageCount).slice(0, 5),
      },
      customer: {
        newCustomerCount,
        repeatCustomerCount: repeatCustomerIds.size,
        repeatRate: customerOrders > 0 ? round(repeatCustomerIds.size / customerOrders) : 0,
        topCustomers,
        dormantCustomers,
        loyaltyPointsIssued: raw.pointLedgers.filter((ledger) => ledger.points > 0).reduce((sum, ledger) => sum + ledger.points, 0),
      },
      campaign: {
        activeCampaignCount: raw.activeCampaigns.length,
        campaignUsageCount: raw.campaigns.reduce((sum, campaign) => sum + campaign.usageCount, 0),
        campaignDiscountTotal: money(raw.campaigns.reduce((sum, campaign) => sum + toMoneyNumber(campaign.discountTotal), 0)),
        topCampaigns: raw.campaigns.slice(0, 5).map((campaign) => ({ campaignId: campaign.id, name: campaign.name, usageCount: campaign.usageCount, discountTotal: toMoneyNumber(campaign.discountTotal) })),
        campaignsNearUsageLimit,
      },
      kitchen: {
        ticketCount: raw.kitchenTickets.length,
        readyTicketCount: raw.kitchenTickets.filter((ticket) => ticket.status === KitchenTicketStatus.READY || ticket.status === KitchenTicketStatus.COMPLETED).length,
        cancelledTicketCount: raw.kitchenTickets.filter((ticket) => ticket.status === KitchenTicketStatus.CANCELLED).length,
        overdueTicketCount: kitchenDurations.filter((duration) => duration.overdue).length,
        averageWaitMinutes: average(kitchenDurations.map((duration) => duration.wait)),
        averageCookMinutes: average(kitchenDurations.map((duration) => duration.cook)),
        topOverdueStations: [...overdueByStation.values()].sort((a, b) => b.overdueTicketCount - a.overdueTicketCount).slice(0, 5),
        urgentTicketCount: raw.kitchenTickets.filter((ticket) => ticket.urgent).length,
      },
      table: {
        dineInOrderCount: orders.filter((order) => order.orderType === 'DINE_IN').length,
        tableOrderCount: tableOrders.length,
        averageTableDuration: average(tableOrders.map((order) => order.openedAt && order.closedAt ? minutesBetween(order.openedAt, order.closedAt) : null)),
        topTablesBySales: [...byTable.values()].sort((a, b) => b.sales - a.sales).slice(0, 5),
        cancelledTableOrderCount: raw.cancelledTableOrders.length,
      },
      refundApproval: {
        refundCount: raw.refunds.length,
        refundTotal,
        managerApprovalCount: approvals.length,
        voidCount: raw.auditLogs.filter((log) => log.action === OrderAuditAction.VOIDED).length,
        cashOutCount: raw.cashOutMovements.filter((movement) => movement.type === CashMovementType.CASH_OUT).length,
        manualDiscountApprovalCount: approvals.filter((log) => log.reason.toLowerCase().includes('discount')).length,
      },
    };
  }

  private highlights(metrics: BusinessDailyMetrics, salesEvidence: string, kitchenEvidence: string, tableEvidence: string) {
    if (metrics.sales.orderCount === 0) return [{ text: 'data_insufficient: Not enough paid order data to identify a sales highlight.', evidenceIds: [salesEvidence] }];
    const highlights = [{ text: `${metrics.sales.orderCount} paid orders generated ${metrics.sales.netSales.toFixed(2)} net sales.`, evidenceIds: [salesEvidence] }];
    if (metrics.kitchen.ticketCount > 0) highlights.push({ text: `${metrics.kitchen.readyTicketCount} kitchen tickets reached ready/completed status.`, evidenceIds: [kitchenEvidence] });
    if (metrics.table.tableOrderCount > 0) highlights.push({ text: `${metrics.table.tableOrderCount} table-linked orders were served.`, evidenceIds: [tableEvidence] });
    return highlights;
  }

  private risks(metrics: BusinessDailyMetrics, refundEvidence: string, discountEvidence: string, kitchenEvidence: string, approvalEvidence: string) {
    const risks = [];
    if (metrics.sales.refundTotal > 0) risks.push({ text: `Refunds reached ${metrics.sales.refundTotal.toFixed(2)} across ${metrics.refundApproval.refundCount} refunds.`, evidenceIds: [refundEvidence] });
    if (metrics.sales.manualDiscountTotal > 0) risks.push({ text: `Manual discounts reached ${metrics.sales.manualDiscountTotal.toFixed(2)} and should be reviewed for approval quality.`, evidenceIds: [discountEvidence] });
    if (metrics.kitchen.overdueTicketCount > 0) risks.push({ text: `${metrics.kitchen.overdueTicketCount} kitchen tickets are overdue or exceeded station SLA.`, evidenceIds: [kitchenEvidence] });
    if (metrics.refundApproval.managerApprovalCount > 0) risks.push({ text: `${metrics.refundApproval.managerApprovalCount} manager approval events occurred in this range.`, evidenceIds: [approvalEvidence] });
    return risks.length > 0 ? risks : [{ text: 'No high-risk anomaly was detected from available evidence.', evidenceIds: [approvalEvidence] }];
  }

  private recommend(metrics: BusinessDailyMetrics, evidence: Record<string, string>): BusinessDailyRecommendation[] {
    const recommendations: BusinessDailyRecommendation[] = [];
    recommendations.push({
      id: 'rec_threshold_discount',
      type: 'CAMPAIGN',
      priority: metrics.sales.orderCount > 0 ? 'MEDIUM' : 'LOW',
      title: 'Create a controlled basket-size campaign draft',
      reason: metrics.sales.orderCount > 0 ? 'Average order value can be lifted with a threshold offer that remains manager-reviewed before activation.' : 'data_insufficient: Use a draft only after reviewing current menu and order volume.',
      evidenceIds: [evidence.salesEvidence],
      action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create campaign draft', campaignTemplate: 'THRESHOLD_DISCOUNT' },
    });
    if (metrics.product.lowSellingProducts.length > 0) {
      recommendations.push({
        id: 'rec_low_selling_product',
        type: 'PRODUCT',
        priority: 'MEDIUM',
        title: 'Test a low-selling product promo',
        reason: `${metrics.product.lowSellingProducts[0].name} has low movement in this range.`,
        evidenceIds: [evidence.salesEvidence],
        action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create product promo draft', campaignTemplate: 'LOW_SELLING_PRODUCT_PROMO' },
      });
    }
    if (metrics.customer.dormantCustomers.length > 0) {
      recommendations.push({
        id: 'rec_customer_reactivation',
        type: 'CUSTOMER',
        priority: 'LOW',
        title: 'Prepare a customer reactivation draft',
        reason: 'Dormant customers exist and can be targeted only after manager confirmation.',
        evidenceIds: [evidence.salesEvidence],
        action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create reactivation draft', campaignTemplate: 'CUSTOMER_REACTIVATION' },
      });
    }
    if (metrics.kitchen.overdueTicketCount > 0) {
      recommendations.push({
        id: 'rec_kitchen_sla',
        type: 'KITCHEN',
        priority: 'HIGH',
        title: 'Review station SLA and routing',
        reason: 'Kitchen overdue tickets indicate station routing or prep capacity needs attention.',
        evidenceIds: [evidence.kitchenEvidence],
        action: { kind: 'NONE', label: 'Review kitchen station report' },
      });
    }
    if (metrics.sales.refundTotal > 0 || metrics.refundApproval.managerApprovalCount > 0) {
      recommendations.push({
        id: 'rec_approval_review',
        type: 'REFUND',
        priority: metrics.sales.refundTotal > 0 ? 'HIGH' : 'MEDIUM',
        title: 'Review refund and manager approval reasons',
        reason: 'Refunds and approvals should be checked for coaching or policy adjustment opportunities.',
        evidenceIds: [evidence.refundEvidence, evidence.approvalEvidence],
        action: { kind: 'NONE', label: 'Review order audit logs' },
      });
    }
    return recommendations;
  }
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function average(values: Array<number | null>) {
  const real = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return real.length > 0 ? money(real.reduce((sum, value) => sum + value, 0) / real.length) : 0;
}

function minutesBetween(from: Date, to: Date) {
  return money(Math.max(0, to.getTime() - from.getTime()) / 60000);
}

function dormantCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return cutoff;
}
