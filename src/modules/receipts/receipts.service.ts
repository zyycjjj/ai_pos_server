import { Injectable, NotFoundException } from '@nestjs/common';

import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReceiptForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return {
      format: 'escpos-80mm',
      store: {
        name: 'AI POS Store',
      },
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        printStatus: order.printStatus,
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
      })),
      totals: {
        subtotal: toMoneyNumber(order.subtotal),
        tax: toMoneyNumber(order.tax),
        tip: toMoneyNumber(order.tip),
        total: toMoneyNumber(order.total),
      },
      footer: {
        message: 'Thank you',
        qrPayload: `ai-pos://orders/${order.id}`,
      },
    };
  }
}
