import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, LoyaltyPointLedgerType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { presentOrder } from '@/common/utils/order-presenter';
import { PrismaService } from '@/prisma/prisma.service';

import { CreateCustomerDto, ListCustomersDto, UpdateCustomerDto } from './dto/customer.dto';
import { InvalidCustomerPhoneError, normalizePhone } from './domain/phone';

export type CustomerOrderInput = {
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
};

export type ResolvedOrderCustomer = {
  customerId: string;
  customerPhoneSnapshot: string;
  customerNameSnapshot: string | null;
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  normalizePhone(input: string) {
    return normalizeCustomerPhone(input);
  }

  async listCustomers(query: ListCustomersDto) {
    const storeId = this.getStoreId();
    const where: Prisma.CustomerWhereInput = {
      storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { phone: { contains: query.search } },
              { normalizedPhone: { contains: normalizePhoneForSearch(query.search) } },
              { name: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ lastOrderAt: 'desc' }, { createdAt: 'desc' }],
        take: query.take ?? 20,
        skip: query.skip ?? 0,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map((customer) => this.presentCustomer(customer)),
      total,
    };
  }

  async getCustomer(id: string) {
    return this.presentCustomer(await this.findCustomer(id));
  }

  async createCustomer(dto: CreateCustomerDto) {
    const storeId = this.getStoreId();
    const normalizedPhone = normalizeCustomerPhone(dto.phone);
    await this.assertPhoneAvailable(storeId, normalizedPhone);
    const customer = await this.prisma.customer.create({
      data: {
        storeId,
        phone: dto.phone.trim(),
        normalizedPhone,
        name: cleanOptional(dto.name),
        note: cleanOptional(dto.note),
      },
    });
    return this.presentCustomer(customer);
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    const current = await this.findCustomer(id);
    const normalizedPhone = dto.phone ? normalizeCustomerPhone(dto.phone) : current.normalizedPhone;
    if (normalizedPhone !== current.normalizedPhone) {
      await this.assertPhoneAvailable(current.storeId, normalizedPhone, id);
    }
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        phone: dto.phone?.trim() ?? current.phone,
        normalizedPhone,
        name: dto.name === undefined ? current.name : cleanOptional(dto.name),
        note: dto.note === undefined ? current.note : cleanOptional(dto.note),
        status: dto.status ?? current.status,
      },
    });
    return this.presentCustomer(customer);
  }

  async lookupByPhone(phone: string) {
    const storeId = this.getStoreId();
    const customer = await this.prisma.customer.findUnique({
      where: { storeId_normalizedPhone: { storeId, normalizedPhone: normalizeCustomerPhone(phone) } },
    });
    return customer ? this.presentCustomer(customer) : null;
  }

  async quickCreate(dto: CreateCustomerDto) {
    const storeId = this.getStoreId();
    const normalizedPhone = normalizeCustomerPhone(dto.phone);
    const customer = await this.prisma.customer.upsert({
      where: { storeId_normalizedPhone: { storeId, normalizedPhone } },
      create: {
        storeId,
        phone: dto.phone.trim(),
        normalizedPhone,
        name: cleanOptional(dto.name),
        note: cleanOptional(dto.note),
      },
      update: {
        name: dto.name ? cleanOptional(dto.name) : undefined,
        note: dto.note ? cleanOptional(dto.note) : undefined,
      },
    });
    return this.presentCustomer(customer);
  }

  async listCustomerOrders(id: string, query: Pick<ListCustomersDto, 'take' | 'skip'> = {}) {
    const customer = await this.findCustomer(id);
    const orders = await this.prisma.order.findMany({
      where: { storeId: customer.storeId, customerId: customer.id },
      include: {
        table: true,
        items: { include: { product: true, refundItems: true } },
        payments: true,
        refunds: { include: { items: true } },
        kitchenTickets: { include: { station: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 20,
      skip: query.skip ?? 0,
    });
    return orders.map(presentOrder);
  }

  async listCustomerPoints(id: string, query: Pick<ListCustomersDto, 'take' | 'skip'> = {}) {
    const customer = await this.findCustomer(id);
    const ledgers = await this.prisma.loyaltyPointLedger.findMany({
      where: { storeId: customer.storeId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 50,
      skip: query.skip ?? 0,
    });
    return ledgers.map((ledger) => this.presentLedger(ledger));
  }

  async resolveOrderCustomer(tx: Prisma.TransactionClient, storeId: string, input: CustomerOrderInput): Promise<ResolvedOrderCustomer | null> {
    if (input.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId } });
      if (!customer) {
        throw new BadRequestException('Customer does not belong to the active store.');
      }
      if (customer.status === CustomerStatus.BLOCKED) {
        throw new BadRequestException('Customer is blocked.');
      }
      return {
        customerId: customer.id,
        customerPhoneSnapshot: customer.phone,
        customerNameSnapshot: customer.name,
      };
    }

    if (!input.customerPhone?.trim()) {
      return null;
    }

    const normalizedPhone = normalizeCustomerPhone(input.customerPhone);
    const customer = await tx.customer.upsert({
      where: { storeId_normalizedPhone: { storeId, normalizedPhone } },
      create: {
        storeId,
        phone: input.customerPhone.trim(),
        normalizedPhone,
        name: cleanOptional(input.customerName),
      },
      update: {
        name: input.customerName ? cleanOptional(input.customerName) : undefined,
      },
    });
    if (customer.status === CustomerStatus.BLOCKED) {
      throw new BadRequestException('Customer is blocked.');
    }
    return {
      customerId: customer.id,
      customerPhoneSnapshot: customer.phone,
      customerNameSnapshot: customer.name,
    };
  }

  async recordPaidOrder(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      customerId?: string | null;
      orderId: string;
      orderTotal: Decimal;
      paidAt: Date;
      createdByUserId?: string;
    },
  ) {
    if (!input.customerId) {
      return { pointsEarned: 0, balanceAfter: null };
    }

    const customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId: input.storeId } });
    if (!customer) {
      throw new BadRequestException('Customer does not belong to the active store.');
    }

    const pointsEarned = Math.max(Math.floor(toMoneyNumber(input.orderTotal)), 0);
    const balanceAfter = customer.pointsBalance + pointsEarned;
    const totalSpend = customer.totalSpend.plus(input.orderTotal).toDecimalPlaces(2);
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        firstOrderAt: customer.firstOrderAt ?? input.paidAt,
        lastOrderAt: input.paidAt,
        orderCount: { increment: 1 },
        totalSpend,
        pointsBalance: balanceAfter,
      },
    });
    if (pointsEarned > 0) {
      await tx.loyaltyPointLedger.create({
        data: {
          storeId: input.storeId,
          customerId: customer.id,
          orderId: input.orderId,
          type: LoyaltyPointLedgerType.EARN,
          points: pointsEarned,
          balanceAfter,
          reason: 'Order paid',
          createdByUserId: input.createdByUserId,
        },
      });
    }
    await tx.order.update({
      where: { id: input.orderId },
      data: {
        loyaltyPointsEarned: pointsEarned,
        loyaltyPointsBalanceAfter: balanceAfter,
      },
    });
    return { pointsEarned, balanceAfter };
  }

  async recordRefundAdjustment(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      customerId?: string | null;
      orderId: string;
      refundAmount: Decimal;
      createdByUserId?: string;
    },
  ) {
    if (!input.customerId) {
      return { pointsAdjusted: 0, balanceAfter: null };
    }
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId: input.storeId } });
    if (!customer) {
      throw new BadRequestException('Customer does not belong to the active store.');
    }
    const pointsToDeduct = Math.min(customer.pointsBalance, Math.max(Math.floor(toMoneyNumber(input.refundAmount)), 0));
    const balanceAfter = Math.max(customer.pointsBalance - pointsToDeduct, 0);
    const totalSpend = Decimal.max(customer.totalSpend.minus(input.refundAmount), new Decimal(0)).toDecimalPlaces(2);
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        totalSpend,
        pointsBalance: balanceAfter,
      },
    });
    if (pointsToDeduct > 0) {
      await tx.loyaltyPointLedger.create({
        data: {
          storeId: input.storeId,
          customerId: customer.id,
          orderId: input.orderId,
          type: LoyaltyPointLedgerType.REFUND_ADJUST,
          points: -pointsToDeduct,
          balanceAfter,
          reason: 'Refund adjusted loyalty points',
          createdByUserId: input.createdByUserId,
        },
      });
    }
    return { pointsAdjusted: -pointsToDeduct, balanceAfter };
  }

  private async findCustomer(id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    return customer;
  }

  private async assertPhoneAvailable(storeId: string, normalizedPhone: string, excludeId?: string) {
    const duplicate = await this.prisma.customer.findFirst({
      where: { storeId, normalizedPhone, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (duplicate) {
      throw new BadRequestException('Customer phone already exists in this store.');
    }
  }

  private presentCustomer(customer: Prisma.CustomerGetPayload<object>) {
    return {
      id: customer.id,
      phone: customer.phone,
      normalizedPhone: customer.normalizedPhone,
      name: customer.name,
      note: customer.note,
      tags: customer.tags ?? [],
      status: customer.status,
      firstOrderAt: customer.firstOrderAt?.toISOString() ?? null,
      lastOrderAt: customer.lastOrderAt?.toISOString() ?? null,
      orderCount: customer.orderCount,
      totalSpend: toMoneyNumber(customer.totalSpend),
      pointsBalance: customer.pointsBalance,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  private presentLedger(ledger: Prisma.LoyaltyPointLedgerGetPayload<object>) {
    return {
      id: ledger.id,
      customerId: ledger.customerId,
      orderId: ledger.orderId,
      type: ledger.type,
      points: ledger.points,
      balanceAfter: ledger.balanceAfter,
      reason: ledger.reason,
      createdByUserId: ledger.createdByUserId,
      createdAt: ledger.createdAt.toISOString(),
    };
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizePhoneForSearch(input: string) {
  return input.trim().startsWith('+') ? `+${input.replace(/\D/g, '')}` : input.replace(/\D/g, '');
}

function normalizeCustomerPhone(input: string) {
  try {
    return normalizePhone(input);
  } catch (error) {
    if (error instanceof InvalidCustomerPhoneError) {
      throw new BadRequestException({
        code: error.code,
        message: error.message,
      });
    }
    throw error;
  }
}
