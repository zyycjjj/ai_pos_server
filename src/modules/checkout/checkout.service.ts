import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { multiplyMoney, toMoney } from '@/common/utils/money';
import { presentOrder } from '@/common/utils/order-presenter';
import { PrismaService } from '@/prisma/prisma.service';

import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(query: ListOrdersDto) {
    const orders = await this.prisma.order.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.take,
      skip: query.skip,
    });

    return orders.map(presentOrder);
  }

  async getOrder(id: string) {
    const order = await this.findOrder(id);
    return presentOrder(order);
  }

  async createOrder(dto: CreateOrderDto) {
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const missingIds = productIds.filter((id) => !productById.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Product not found or inactive: ${missingIds.join(', ')}`);
    }

    const currency = dto.currency ?? products[0]?.currency ?? 'USD';
    const items = dto.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product not found or inactive: ${item.productId}`);
      }

      const lineTotal = multiplyMoney(product.price, item.quantity);
      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
        lineTotal,
      };
    });

    const subtotal = items.reduce((sum, item) => sum.plus(item.lineTotal), new Decimal(0)).toDecimalPlaces(2);
    const tax = toMoney(dto.tax ?? 0);
    const tip = toMoney(dto.tip ?? 0);
    const total = subtotal.plus(tax).plus(tip).toDecimalPlaces(2);

    const order = await this.prisma.order.create({
      data: {
        orderNumber: this.createOrderNumber(),
        currency,
        subtotal,
        tax,
        tip,
        total,
        items: {
          create: items,
        },
      },
      include: { items: { include: { product: true } } },
    });

    return presentOrder(order);
  }

  async markPaid(id: string) {
    const order = await this.findOrder(id);
    if (order.status === OrderStatus.PAID) {
      return presentOrder(order);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be marked paid.');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
      },
      include: { items: { include: { product: true } } },
    });

    return presentOrder(updated);
  }

  async cancelOrder(id: string) {
    const order = await this.findOrder(id);
    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException('Paid orders cannot be cancelled in MVP checkout.');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
      include: { items: { include: { product: true } } },
    });

    return presentOrder(updated);
  }

  private async findOrder(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return order;
  }

  private createOrderNumber() {
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `POS-${timestamp}-${suffix}`;
  }
}
