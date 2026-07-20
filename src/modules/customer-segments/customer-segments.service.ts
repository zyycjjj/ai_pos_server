import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerSegmentStatus, CustomerSegmentType, CustomerStatus, Prisma } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import { UpsertCustomerSegmentDto } from './dto/customer-segment.dto';
import { InvalidCustomerSegmentRuleError, matchesCustomerSegmentRule, parseCustomerSegmentRule } from './domain/segment-rules';

@Injectable()
export class CustomerSegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async listSegments() {
    const storeId = this.getStoreId();
    const segments = await this.prisma.customerSegment.findMany({
      where: { storeId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return segments.map((segment) => this.presentSegment(segment));
  }

  async getSegment(id: string) {
    return this.presentSegment(await this.findSegment(id));
  }

  async createSegment(dto: UpsertCustomerSegmentDto) {
    const storeId = this.getStoreId();
    const rule = this.parseRule(dto.ruleJson);
    const segment = await this.prisma.customerSegment.create({
      data: {
        storeId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        type: CustomerSegmentType.SMART_RULE,
        ruleJson: rule as Prisma.InputJsonValue,
      },
    });
    return this.getSegment(segment.id);
  }

  async updateSegment(id: string, dto: UpsertCustomerSegmentDto) {
    await this.findSegment(id);
    const rule = this.parseRule(dto.ruleJson);
    await this.prisma.customerSegment.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        ruleJson: rule as Prisma.InputJsonValue,
      },
    });
    return this.getSegment(id);
  }

  async updateSegmentStatus(id: string, status: CustomerSegmentStatus) {
    await this.findSegment(id);
    await this.prisma.customerSegment.update({ where: { id }, data: { status } });
    return this.getSegment(id);
  }

  async evaluateSegment(id: string) {
    const segment = await this.findSegment(id);
    const rule = this.parseRule(segment.ruleJson);
    const customers = await this.prisma.customer.findMany({
      where: { storeId: segment.storeId, status: { not: CustomerStatus.BLOCKED } },
      orderBy: { createdAt: 'asc' },
    });
    const now = new Date();
    const matched = customers.filter((customer) => matchesCustomerSegmentRule(rule, customer, now));
    await this.prisma.$transaction(async (tx) => {
      await tx.customerSegmentMember.deleteMany({ where: { segmentId: segment.id } });
      if (matched.length > 0) {
        await tx.customerSegmentMember.createMany({
          data: matched.map((customer) => ({
            storeId: segment.storeId,
            segmentId: segment.id,
            customerId: customer.id,
            matchedAt: now,
            ruleSnapshot: rule as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      }
      await tx.customerSegment.update({
        where: { id: segment.id },
        data: {
          memberCount: matched.length,
          lastEvaluatedAt: now,
        },
      });
    });
    return {
      segmentId: segment.id,
      matchedCustomerCount: matched.length,
      matchedCustomerIds: matched.map((customer) => customer.id),
      evaluatedAt: now.toISOString(),
    };
  }

  async listSegmentCustomers(id: string) {
    const segment = await this.findSegment(id);
    const members = await this.prisma.customerSegmentMember.findMany({
      where: { storeId: segment.storeId, segmentId: segment.id },
      include: { customer: true },
      orderBy: { matchedAt: 'desc' },
      take: 100,
    });
    return members.map((member) => ({
      id: member.customer.id,
      phone: member.customer.phone,
      name: member.customer.name,
      orderCount: member.customer.orderCount,
      totalSpend: toMoneyNumber(member.customer.totalSpend),
      pointsBalance: member.customer.pointsBalance,
      lastOrderAt: member.customer.lastOrderAt?.toISOString() ?? null,
      matchedAt: member.matchedAt.toISOString(),
    }));
  }

  async assertSegmentBelongsToStore(id: string) {
    return this.findSegment(id);
  }

  async segmentAnalytics() {
    const storeId = this.getStoreId();
    const [segmentCount, activeSegmentCount, topSegments, customerCampaigns] = await Promise.all([
      this.prisma.customerSegment.count({ where: { storeId } }),
      this.prisma.customerSegment.count({ where: { storeId, status: CustomerSegmentStatus.ACTIVE } }),
      this.prisma.customerSegment.findMany({
        where: { storeId },
        orderBy: [{ memberCount: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
      }),
      this.prisma.campaign.findMany({
        where: { storeId, customerEligibilityMode: { not: 'ALL_CUSTOMERS' } },
        orderBy: { discountTotal: 'desc' },
        take: 10,
      }),
    ]);
    return {
      segmentCount,
      activeSegmentCount,
      topSegments: topSegments.map((segment) => this.presentSegment(segment)),
      customerCampaignUsageCount: customerCampaigns.reduce((sum, campaign) => sum + campaign.usageCount, 0),
      customerCampaignDiscountTotal: customerCampaigns.reduce((sum, campaign) => sum + toMoneyNumber(campaign.discountTotal), 0),
    };
  }

  private async findSegment(id: string) {
    const segment = await this.prisma.customerSegment.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!segment) {
      throw new NotFoundException('Customer segment not found.');
    }
    return segment;
  }

  private parseRule(value: unknown) {
    try {
      return parseCustomerSegmentRule(value);
    } catch (error) {
      if (error instanceof InvalidCustomerSegmentRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private presentSegment(segment: Prisma.CustomerSegmentGetPayload<object>) {
    return {
      id: segment.id,
      name: segment.name,
      description: segment.description,
      status: segment.status,
      type: segment.type,
      ruleJson: segment.ruleJson,
      memberCount: segment.memberCount,
      lastEvaluatedAt: segment.lastEvaluatedAt?.toISOString() ?? null,
      createdAt: segment.createdAt.toISOString(),
      updatedAt: segment.updatedAt.toISOString(),
    };
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
