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
      include: { store: true, items: { include: { product: true } }, payments: true },
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
        name: item.product.name,
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
        cashReceived: order.cashReceived === null ? null : toMoneyNumber(order.cashReceived),
        changeDue: order.changeDue === null ? null : toMoneyNumber(order.changeDue),
      },
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

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
