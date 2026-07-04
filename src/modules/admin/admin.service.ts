import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiDraftStatus, OrderStatus, StoreRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { hashPassword } from '@/modules/auth/password';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { PrismaService } from '@/prisma/prisma.service';

import { CreateStaffDto } from './dto/create-staff.dto';
import { DisableStaffDto } from './dto/disable-staff.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContextService,
    private readonly cls: ClsService,
  ) {}

  async getDashboard() {
    const storeId = this.storeContext.getStoreId();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const paidAggregate = await this.prisma.order.aggregate({
      where: {
        storeId,
        status: OrderStatus.PAID,
        paidAt: { gte: start },
      },
      _sum: { total: true },
      _count: true,
    });
    const activeProducts = await this.prisma.product.count({ where: { storeId, isActive: true } });
    const ordersCount = paidAggregate._count;
    const todaySales = toMoneyNumber(paidAggregate._sum.total ?? 0);

    return {
      todaySales,
      ordersCount,
      avgTicket: ordersCount > 0 ? toMoneyNumber(todaySales / ordersCount) : 0,
      activeProducts,
    };
  }

  async listStaff() {
    const storeId = this.storeContext.getStoreId();
    const staff = await this.prisma.storeUser.findMany({
      where: { storeId },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return staff.map((item) => this.presentStaff(item));
  }

  async createStaff(dto: CreateStaffDto) {
    const storeId = this.storeContext.getStoreId();
    const currentUser = this.getCurrentUser();
    this.assertManageableCreate(dto.role, currentUser.role);

    const email = dto.email.toLowerCase().trim();
    const staff = await this.prisma.$transaction(
      async (tx) => {
        const user =
          (await tx.user.findUnique({ where: { email } })) ??
          (await tx.user.create({
            data: {
              email,
              name: dto.name?.trim(),
              passwordHash: hashPassword(dto.password),
            },
          }));

        const existing = await tx.storeUser.findUnique({
          where: { storeId_userId: { storeId, userId: user.id } },
        });
        if (existing) {
          throw new BadRequestException('Staff already belongs to this store.');
        }

        return tx.storeUser.create({
          data: {
            storeId,
            userId: user.id,
            role: dto.role,
            active: true,
          },
          include: { user: true },
        });
      },
      { timeout: 15_000 },
    );

    return this.presentStaff(staff);
  }

  async updateStaffRole(id: string, dto: UpdateStaffRoleDto) {
    const storeId = this.storeContext.getStoreId();
    const currentUser = this.getCurrentUser();
    this.assertManageableCreate(dto.role, currentUser.role);
    const staff = await this.findStaffMembership(id, storeId);
    this.assertCanManageStaff(currentUser, staff);

    const updated = await this.prisma.storeUser.update({
      where: { id },
      data: { role: dto.role },
      include: { user: true },
    });

    return this.presentStaff(updated);
  }

  async disableStaff(id: string, dto: DisableStaffDto) {
    const storeId = this.storeContext.getStoreId();
    const currentUser = this.getCurrentUser();
    const staff = await this.findStaffMembership(id, storeId);
    this.assertCanManageStaff(currentUser, staff);
    if (staff.userId === currentUser.id) {
      throw new BadRequestException('Current user cannot disable themselves.');
    }

    const updated = await this.prisma.storeUser.update({
      where: { id },
      data: { active: !dto.disabled },
      include: { user: true },
    });

    return this.presentStaff(updated);
  }

  async listProducts() {
    const storeId = this.storeContext.getStoreId();
    const products = await this.prisma.product.findMany({
      where: { storeId },
      include: {
        modifierGroups: {
          select: { id: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      price: toMoneyNumber(product.price),
      currency: product.currency,
      status: product.isActive ? 'ACTIVE' : 'INACTIVE',
      modifierCount: product.modifierGroups.length,
      updatedAt: product.updatedAt.toISOString(),
    }));
  }

  async listCampaigns() {
    const storeId = this.storeContext.getStoreId();
    const campaigns = await this.prisma.campaign.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      goal: campaign.goal,
      timeWindow: campaign.timeWindow,
      category: this.inferCampaignCategory(campaign.structuredJson),
      status: campaign.status,
      createdAt: campaign.createdAt.toISOString(),
    }));
  }

  async listAiDrafts() {
    const storeId = this.storeContext.getStoreId();
    const drafts = await this.prisma.aiDraft.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return drafts.map((draft) => ({
      id: draft.id,
      type: this.inferDraftType(draft.structuredJson),
      title: this.inferDraftTitle(draft.structuredJson, draft.prompt),
      status: draft.status === AiDraftStatus.CONFIRMED ? 'IMPORTED' : draft.status,
      createdAt: draft.createdAt.toISOString(),
    }));
  }

  private async findStaffMembership(id: string, storeId: string) {
    const staff = await this.prisma.storeUser.findFirst({
      where: { id, storeId },
      include: { user: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found.');
    }
    return staff;
  }

  private assertManageableCreate(role: StoreRole, _currentRole: StoreRole) {
    if (role === StoreRole.OWNER) {
      throw new BadRequestException('Owner role cannot be created or assigned from Admin shell.');
    }
  }

  private assertCanManageStaff(currentUser: AuthRequestUser, staff: Awaited<ReturnType<AdminService['findStaffMembership']>>) {
    if (currentUser.role === StoreRole.MANAGER && staff.role === StoreRole.OWNER) {
      throw new ForbiddenException('Manager cannot manage owners.');
    }
  }

  private getCurrentUser() {
    const user = this.cls.get('user') as AuthRequestUser | undefined;
    if (!user) {
      throw new ForbiddenException('Admin user context is required.');
    }
    return user;
  }

  private presentStaff(staff: Awaited<ReturnType<AdminService['findStaffMembership']>>) {
    return {
      id: staff.id,
      userId: staff.userId,
      email: staff.user.email,
      name: staff.user.name,
      role: staff.role,
      status: staff.active && staff.user.active ? 'ACTIVE' : 'DISABLED',
    };
  }

  private inferDraftType(value: unknown) {
    if (value && typeof value === 'object' && (value as { draftType?: unknown }).draftType === 'campaign') {
      return 'CAMPAIGN';
    }
    return 'MENU';
  }

  private inferDraftTitle(value: unknown, prompt: string) {
    if (value && typeof value === 'object') {
      const candidate = value as {
        campaign?: { campaignName?: unknown };
        items?: Array<{ name?: unknown }>;
        products?: Array<{ name?: unknown }>;
      };
      if (typeof candidate.campaign?.campaignName === 'string') {
        return candidate.campaign.campaignName;
      }
      const firstItem = candidate.items?.[0]?.name ?? candidate.products?.[0]?.name;
      if (typeof firstItem === 'string') {
        return `${firstItem} Draft`;
      }
    }
    return prompt.slice(0, 60) || 'AI Draft';
  }

  private inferCampaignCategory(value: unknown) {
    if (value && typeof value === 'object') {
      const targetProducts = (value as { targetProducts?: unknown }).targetProducts;
      if (Array.isArray(targetProducts) && typeof targetProducts[0] === 'string') {
        return targetProducts[0];
      }
    }
    return null;
  }
}
