import { Injectable, NotFoundException } from '@nestjs/common';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async getReceiptForOrder(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: this.getStoreId() },
      include: { store: true, items: { include: { product: true } }, payments: true, refunds: { include: { items: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return {
      format: 'escpos-80mm',
      store: {
        name: order.store?.name ?? 'AI-POS Store',
      },
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        pickupNumber: order.pickupNumber,
        status: order.status,
        printStatus: order.printStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        printedAt: order.printedAt?.toISOString() ?? null,
      },
      currency: order.currency,
      items: order.items.map((item) => ({
        name: item.productNameSnapshot ?? item.product.name,
        quantity: item.quantity,
        unitPrice: toMoneyNumber(item.unitPrice),
        lineTotal: toMoneyNumber(item.lineTotal),
        modifiers: item.modifiers ?? [],
      })),
      totals: {
        subtotal: toMoneyNumber(order.subtotal),
        adjustment: toMoneyNumber(order.adjustment),
        tax: toMoneyNumber(order.tax),
        tip: toMoneyNumber(order.tip),
        total: toMoneyNumber(order.total),
        refundedTotal: toMoneyNumber(order.refunds.reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0)),
        netTotal: toMoneyNumber(toMoneyNumber(order.total) - order.refunds.reduce((sum, refund) => sum + toMoneyNumber(refund.amount), 0)),
        cashReceived: order.cashReceived === null ? null : toMoneyNumber(order.cashReceived),
        changeDue: order.changeDue === null ? null : toMoneyNumber(order.changeDue),
      },
      refunds: order.refunds.map((refund) => ({
        id: refund.id,
        refundNumber: refund.refundNumber,
        status: refund.status,
        method: refund.method,
        amount: toMoneyNumber(refund.amount),
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      })),
      payments: order.payments.map((payment) => ({
        method: payment.method,
        amount: toMoneyNumber(payment.amount),
        amountReceived: payment.amountReceived === null ? null : toMoneyNumber(payment.amountReceived),
        changeDue: payment.changeDue === null ? null : toMoneyNumber(payment.changeDue),
      })),
      footer: {
        message: 'Thank you',
        qrPayload: `ai-pos://orders/${order.id}`,
      },
    };
  }

  async getReceiptForRefund(refundId: string) {
    const refund = await this.prisma.refund.findFirst({
      where: { id: refundId, storeId: this.getStoreId() },
      include: {
        store: true,
        order: true,
        items: {
          include: {
            orderItem: {
              include: { product: true },
            },
          },
        },
      },
    });
    if (!refund) {
      throw new NotFoundException('Refund not found.');
    }

    return {
      format: 'escpos-80mm',
      type: 'refund',
      store: {
        name: refund.store?.name ?? 'AI-POS Store',
      },
      refund: {
        id: refund.id,
        refundNumber: refund.refundNumber,
        status: refund.status,
        method: refund.method,
        amount: toMoneyNumber(refund.amount),
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
      },
      order: {
        id: refund.order.id,
        orderNumber: refund.order.orderNumber,
        pickupNumber: refund.order.pickupNumber,
        status: refund.order.status,
        paidAt: refund.order.paidAt?.toISOString() ?? null,
      },
      currency: refund.order.currency,
      items: refund.items.map((item) => ({
        name: item.orderItem.productNameSnapshot ?? item.orderItem.product.name,
        quantity: item.quantity,
        amount: toMoneyNumber(item.amount),
      })),
      footer: {
        message: 'Refund receipt',
        qrPayload: `ai-pos://refunds/${refund.id}`,
      },
    };
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
