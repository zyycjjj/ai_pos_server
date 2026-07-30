import { Injectable } from '@nestjs/common';
import { OrderAuditAction, OrderStatus, RefundStatus } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import type { BusinessDailyRange } from '../business-daily/business-daily.types';
import type { BusinessQueryEvidence, BusinessQueryIntent } from './business-query.types';

@Injectable()
export class BusinessQueryDrilldown {
  constructor(private readonly prisma: PrismaService) {}

  async expand(input: { storeId: string; intent: BusinessQueryIntent; range: BusinessDailyRange }): Promise<BusinessQueryEvidence[]> {
    if (input.intent === 'REFUND_ANALYSIS') return this.refundEvidence(input.storeId, input.range);
    if (input.intent === 'PRODUCT_ANALYSIS') return this.productEvidence(input.storeId, input.range);
    if (input.intent === 'CUSTOMER_ANALYSIS') return this.customerEvidence(input.storeId);
    if (input.intent === 'KITCHEN_ANALYSIS') return this.kitchenEvidence(input.storeId, input.range);
    if (input.intent === 'APPROVAL_ANALYSIS') return this.approvalEvidence(input.storeId, input.range);
    if (input.intent === 'CAMPAIGN_ANALYSIS') return this.campaignEvidence(input.storeId);
    if (input.intent === 'TABLE_ANALYSIS') return this.tableEvidence(input.storeId, input.range);
    return [];
  }

  private async refundEvidence(storeId: string, range: BusinessDailyRange): Promise<BusinessQueryEvidence[]> {
    const refunds = await this.prisma.refund.findMany({
      where: { storeId, status: RefundStatus.COMPLETED, createdAt: { gte: range.start, lte: range.end } },
      include: { order: { include: { table: true, customer: true, items: true } }, operator: true, approvedBy: true },
      orderBy: { amount: 'desc' },
      take: 8,
    });
    return refunds.map((refund, index) => ({
      id: `query_ev_refund_order_${index + 1}_${refund.id}`,
      type: 'ORDER',
      title: `Refund ${refund.refundNumber} for order ${refund.order.orderNumber}`,
      value: toMoneyNumber(refund.amount),
      refId: refund.orderId,
      detail: {
        refundId: refund.id,
        refundNumber: refund.refundNumber,
        orderId: refund.orderId,
        orderNumber: refund.order.orderNumber,
        orderType: refund.order.orderType,
        tableName: refund.order.table?.name ?? null,
        customerName: refund.order.customerNameSnapshot ?? refund.order.customer?.name ?? null,
        customerPhone: refund.order.customerPhoneSnapshot ?? refund.order.customer?.phone ?? null,
        reason: refund.reason,
        operatorName: refund.operator?.name ?? refund.operator?.email ?? null,
        approvedByName: refund.approvedBy?.name ?? refund.approvedBy?.email ?? null,
        itemCount: refund.order.items.length,
        createdAt: refund.createdAt.toISOString(),
      },
      source: { repository: 'refund', range: publicRange(range) },
    }));
  }

  private async productEvidence(storeId: string, range: BusinessDailyRange): Promise<BusinessQueryEvidence[]> {
    const orders = await this.prisma.order.findMany({
      where: { storeId, status: { in: [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED] }, paidAt: { gte: range.start, lte: range.end } },
      include: { items: true },
      take: 500,
    });
    const byProduct = new Map<string, { productId: string; name: string; quantity: number; sales: number; orderCount: number }>();
    for (const order of orders) {
      const seen = new Set<string>();
      for (const item of order.items) {
        const current = byProduct.get(item.productId) ?? { productId: item.productId, name: item.productNameSnapshot ?? item.productId, quantity: 0, sales: 0, orderCount: 0 };
        current.quantity += item.quantity;
        current.sales += toMoneyNumber(item.lineTotal);
        if (!seen.has(item.productId)) {
          current.orderCount += 1;
          seen.add(item.productId);
        }
        byProduct.set(item.productId, current);
      }
    }
    return [...byProduct.values()].sort((a, b) => b.sales - a.sales).slice(0, 8).map((product, index) => ({
      id: `query_ev_product_detail_${index + 1}_${product.productId}`,
      type: 'PRODUCT',
      title: `${product.name} product detail`,
      value: product.sales,
      refId: product.productId,
      detail: product,
      source: { repository: 'order_items', range: publicRange(range) },
    }));
  }

  private async customerEvidence(storeId: string): Promise<BusinessQueryEvidence[]> {
    const customers = await this.prisma.customer.findMany({
      where: { storeId, status: { not: 'BLOCKED' } },
      orderBy: [{ lastOrderAt: 'asc' }, { totalSpend: 'desc' }],
      take: 8,
    });
    return customers.map((customer, index) => ({
      id: `query_ev_customer_detail_${index + 1}_${customer.id}`,
      type: 'CUSTOMER',
      title: `${customer.name ?? customer.phone} customer detail`,
      value: toMoneyNumber(customer.totalSpend),
      refId: customer.id,
      detail: {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        orderCount: customer.orderCount,
        totalSpend: toMoneyNumber(customer.totalSpend),
        pointsBalance: customer.pointsBalance,
        lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
      },
      source: { repository: 'customer' },
    }));
  }

  private async kitchenEvidence(storeId: string, range: BusinessDailyRange): Promise<BusinessQueryEvidence[]> {
    const tickets = await this.prisma.kitchenTicket.findMany({
      where: { storeId, createdAt: { gte: range.start, lte: range.end } },
      include: { station: true, order: { include: { table: true } } },
      orderBy: [{ rushedAt: 'desc' }, { createdAt: 'asc' }],
      take: 8,
    });
    return tickets.map((ticket, index) => ({
      id: `query_ev_kitchen_ticket_${index + 1}_${ticket.id}`,
      type: 'KITCHEN',
      title: `${ticket.station.name} ticket ${ticket.ticketNumber}`,
      value: ticket.status,
      refId: ticket.id,
      detail: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        stationName: ticket.station.name,
        status: ticket.status,
        orderNumber: ticket.order.orderNumber,
        tableName: ticket.order.table?.name ?? null,
        rushed: Boolean(ticket.rushedAt),
        createdAt: ticket.createdAt.toISOString(),
      },
      source: { repository: 'kitchen_ticket', range: publicRange(range) },
    }));
  }

  private async approvalEvidence(storeId: string, range: BusinessDailyRange): Promise<BusinessQueryEvidence[]> {
    const logs = await this.prisma.orderAuditLog.findMany({
      where: { storeId, createdAt: { gte: range.start, lte: range.end }, action: { in: [OrderAuditAction.MANAGER_APPROVAL, OrderAuditAction.REFUNDED, OrderAuditAction.VOIDED] } },
      include: { order: true, operator: true, approvedBy: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    return logs.map((log, index) => ({
      id: `query_ev_approval_detail_${index + 1}_${log.id}`,
      type: 'APPROVAL',
      title: `${log.action} for order ${log.order.orderNumber}`,
      value: log.amount ? toMoneyNumber(log.amount) : log.action,
      refId: log.orderId,
      detail: {
        auditLogId: log.id,
        orderId: log.orderId,
        orderNumber: log.order.orderNumber,
        action: log.action,
        reason: log.reason,
        operatorName: log.operator?.name ?? log.operator?.email ?? null,
        approvedByName: log.approvedBy?.name ?? log.approvedBy?.email ?? null,
        createdAt: log.createdAt.toISOString(),
      },
      source: { repository: 'order_audit_log', range: publicRange(range) },
    }));
  }

  private async campaignEvidence(storeId: string): Promise<BusinessQueryEvidence[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { storeId },
      orderBy: [{ usageCount: 'desc' }, { discountTotal: 'desc' }],
      take: 8,
    });
    return campaigns.map((campaign, index) => ({
      id: `query_ev_campaign_detail_${index + 1}_${campaign.id}`,
      type: 'CAMPAIGN',
      title: `${campaign.name} campaign detail`,
      value: campaign.usageCount,
      refId: campaign.id,
      detail: {
        campaignId: campaign.id,
        name: campaign.name,
        status: campaign.status,
        type: campaign.type,
        usageCount: campaign.usageCount,
        discountTotal: toMoneyNumber(campaign.discountTotal),
      },
      source: { repository: 'campaign' },
    }));
  }

  private async tableEvidence(storeId: string, range: BusinessDailyRange): Promise<BusinessQueryEvidence[]> {
    const orders = await this.prisma.order.findMany({
      where: { storeId, tableId: { not: null }, paidAt: { gte: range.start, lte: range.end } },
      include: { table: true },
      orderBy: { total: 'desc' },
      take: 8,
    });
    return orders.map((order, index) => ({
      id: `query_ev_table_order_${index + 1}_${order.id}`,
      type: 'TABLE',
      title: `${order.table?.name ?? 'Table'} order ${order.orderNumber}`,
      value: toMoneyNumber(order.total),
      refId: order.id,
      detail: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableName: order.table?.name ?? null,
        orderType: order.orderType,
        total: toMoneyNumber(order.total),
        paidAt: order.paidAt?.toISOString() ?? null,
      },
      source: { repository: 'table_order', range: publicRange(range) },
    }));
  }
}

function publicRange(range: BusinessDailyRange) {
  return { from: range.from, to: range.to, timezone: range.timezone, preset: range.preset };
}
