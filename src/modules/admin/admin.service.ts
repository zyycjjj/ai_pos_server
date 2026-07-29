import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiDraftStatus, CampaignStatus, CampaignType, CatalogStatus, CustomerEligibilityMode, KitchenStationStatus, ModifierOptionStatus, OrderStatus, ProductAvailabilityStatus, PromotionStackingPolicy, StoreRole } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { hashPassword } from '@/modules/auth/password';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { PrismaService } from '@/prisma/prisma.service';

import { CreateStaffDto } from './dto/create-staff.dto';
import { DisableStaffDto } from './dto/disable-staff.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';
import type { UpdateCampaignStatusDto, UpsertCampaignDto } from './dto/campaign.dto';
import type {
  ListAdminProductsDto,
  UpdateCatalogStatusDto,
  UpdateModifierOptionStatusDto,
  UpdateProductAvailabilityDto,
  UpdateProductStatusDto,
  UpsertCategoryDto,
  UpsertModifierGroupDto,
  UpsertModifierOptionDto,
  UpsertProductDto,
} from './dto/catalog.dto';

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

    const paidStatuses = [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED];
    const paidAggregate = await this.prisma.order.aggregate({
      where: {
        storeId,
        status: { in: paidStatuses },
        paidAt: { gte: start },
      },
      _sum: { total: true },
      _count: true,
    });
    const refundAggregate = await this.prisma.refund.aggregate({
      where: {
        storeId,
        createdAt: { gte: start },
      },
      _sum: { amount: true },
      _count: true,
    });
    const activeProducts = await this.prisma.product.count({ where: { storeId, isActive: true } });
    const ordersCount = paidAggregate._count;
    const grossSales = toMoneyNumber(paidAggregate._sum.total ?? 0);
    const refundTotal = toMoneyNumber(refundAggregate._sum.amount ?? 0);
    const todaySales = toMoneyNumber(grossSales - refundTotal);

    return {
      todaySales,
      grossSales,
      netSales: todaySales,
      refundTotal,
      refundCount: refundAggregate._count,
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

  async listProducts(query: ListAdminProductsDto = {}) {
    const storeId = this.storeContext.getStoreId();
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        ...(query.search?.trim() ? { name: { contains: query.search.trim() } } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.kitchenStationId ? { kitchenStationId: query.kitchenStationId } : {}),
        ...(query.status ? { isActive: query.status === 'ACTIVE' } : {}),
        ...(query.availabilityStatus ? { availabilityStatus: query.availabilityStatus } : {}),
      },
      include: {
        categoryRef: true,
        kitchenStation: true,
        modifierGroups: {
          select: { id: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.categoryRef ? { id: product.categoryRef.id, name: product.categoryRef.name } : null,
      categoryName: product.categoryRef?.name ?? product.category,
      kitchenStation: product.kitchenStation
        ? { id: product.kitchenStation.id, name: product.kitchenStation.name, code: product.kitchenStation.code }
        : null,
      price: toMoneyNumber(product.price),
      currency: product.currency,
      status: product.isActive ? 'ACTIVE' : 'INACTIVE',
      availabilityStatus: product.availabilityStatus,
      modifierCount: product.modifierGroups.length,
      updatedAt: product.updatedAt.toISOString(),
    }));
  }

  async getProduct(id: string) {
    const product = await this.findProduct(id);
    return this.presentProductDetail(product);
  }

  async createProduct(dto: UpsertProductDto) {
    const storeId = this.storeContext.getStoreId();
    const category = await this.resolveCategory(dto.categoryId);
    const kitchenStation = await this.resolveKitchenStation(dto.kitchenStationId);
    const product = await this.prisma.product.create({
      data: {
        storeId,
        name: this.cleanName(dto.name, 'Product name is required.'),
        description: this.cleanOptional(dto.description),
        categoryId: category?.id,
        category: category?.name,
        kitchenStationId: kitchenStation?.id,
        price: dto.price,
        currency: 'USD',
        isActive: dto.status !== 'INACTIVE',
        availabilityStatus: dto.availabilityStatus ?? ProductAvailabilityStatus.AVAILABLE,
      },
      include: this.productDetailInclude(),
    });
    return this.presentProductDetail(product);
  }

  async updateProduct(id: string, dto: UpsertProductDto) {
    await this.findProduct(id);
    const category = await this.resolveCategory(dto.categoryId);
    const kitchenStation = await this.resolveKitchenStation(dto.kitchenStationId);
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: this.cleanName(dto.name, 'Product name is required.'),
        description: this.cleanOptional(dto.description),
        categoryId: category?.id,
        category: category?.name,
        kitchenStationId: kitchenStation?.id,
        price: dto.price,
        isActive: dto.status !== 'INACTIVE',
        availabilityStatus: dto.availabilityStatus ?? ProductAvailabilityStatus.AVAILABLE,
      },
      include: this.productDetailInclude(),
    });
    return this.presentProductDetail(product);
  }

  async updateProductStatus(id: string, dto: UpdateProductStatusDto) {
    await this.findProduct(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: dto.status === 'ACTIVE' },
      include: this.productDetailInclude(),
    });
    return this.presentProductDetail(product);
  }

  async updateProductAvailability(id: string, dto: UpdateProductAvailabilityDto) {
    await this.findProduct(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { availabilityStatus: dto.availabilityStatus },
      include: this.productDetailInclude(),
    });
    return this.presentProductDetail(product);
  }

  async listCategories() {
    const storeId = this.storeContext.getStoreId();
    const categories = await this.prisma.category.findMany({
      where: { storeId },
      include: { defaultKitchenStation: true, _count: { select: { products: true } } },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      status: category.status,
      defaultKitchenStation: category.defaultKitchenStation
        ? { id: category.defaultKitchenStation.id, name: category.defaultKitchenStation.name, code: category.defaultKitchenStation.code }
        : null,
      productCount: category._count.products,
      sortOrder: category.sortOrder,
    }));
  }

  async createCategory(dto: UpsertCategoryDto) {
    const storeId = this.storeContext.getStoreId();
    const defaultKitchenStation = await this.resolveKitchenStation(dto.defaultKitchenStationId);
    const category = await this.prisma.category.create({
      data: {
        storeId,
        name: this.cleanName(dto.name, 'Category name is required.'),
        defaultKitchenStationId: defaultKitchenStation?.id,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { defaultKitchenStation: true, _count: { select: { products: true } } },
    });
    return {
      id: category.id,
      name: category.name,
      status: category.status,
      defaultKitchenStation: category.defaultKitchenStation
        ? { id: category.defaultKitchenStation.id, name: category.defaultKitchenStation.name, code: category.defaultKitchenStation.code }
        : null,
      productCount: category._count.products,
      sortOrder: category.sortOrder,
    };
  }

  async updateCategory(id: string, dto: UpsertCategoryDto) {
    await this.findCategory(id);
    const defaultKitchenStation = await this.resolveKitchenStation(dto.defaultKitchenStationId);
    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: this.cleanName(dto.name, 'Category name is required.'),
        defaultKitchenStationId: defaultKitchenStation?.id,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { defaultKitchenStation: true, _count: { select: { products: true } } },
    });
    await this.prisma.product.updateMany({
      where: { storeId: this.storeContext.getStoreId(), categoryId: id },
      data: { category: category.name },
    });
    return {
      id: category.id,
      name: category.name,
      status: category.status,
      defaultKitchenStation: category.defaultKitchenStation
        ? { id: category.defaultKitchenStation.id, name: category.defaultKitchenStation.name, code: category.defaultKitchenStation.code }
        : null,
      productCount: category._count.products,
      sortOrder: category.sortOrder,
    };
  }

  async updateCategoryStatus(id: string, dto: UpdateCatalogStatusDto) {
    await this.findCategory(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: { status: dto.status },
      include: { defaultKitchenStation: true, _count: { select: { products: true } } },
    });
    return {
      id: category.id,
      name: category.name,
      status: category.status,
      defaultKitchenStation: category.defaultKitchenStation
        ? { id: category.defaultKitchenStation.id, name: category.defaultKitchenStation.name, code: category.defaultKitchenStation.code }
        : null,
      productCount: category._count.products,
      sortOrder: category.sortOrder,
    };
  }

  async createModifierGroup(productId: string, dto: UpsertModifierGroupDto) {
    await this.findProduct(productId);
    const selection = this.normalizeSelection(dto);
    const group = await this.prisma.productModifierGroup.create({
      data: {
        productId,
        name: this.cleanName(dto.name, 'Modifier group name is required.'),
        required: selection.required,
        multiSelect: selection.multiSelect,
        minSelect: selection.minSelect,
        maxSelect: selection.maxSelect,
        displayOrder: dto.sortOrder ?? 0,
      },
      include: { options: { orderBy: { displayOrder: 'asc' } } },
    });
    return this.presentModifierGroup(group);
  }

  async updateModifierGroup(groupId: string, dto: UpsertModifierGroupDto) {
    await this.findModifierGroup(groupId);
    const selection = this.normalizeSelection(dto);
    const group = await this.prisma.productModifierGroup.update({
      where: { id: groupId },
      data: {
        name: this.cleanName(dto.name, 'Modifier group name is required.'),
        required: selection.required,
        multiSelect: selection.multiSelect,
        minSelect: selection.minSelect,
        maxSelect: selection.maxSelect,
        displayOrder: dto.sortOrder ?? 0,
      },
      include: { options: { orderBy: { displayOrder: 'asc' } } },
    });
    return this.presentModifierGroup(group);
  }

  async updateModifierGroupStatus(groupId: string, dto: UpdateCatalogStatusDto) {
    await this.findModifierGroup(groupId);
    const group = await this.prisma.productModifierGroup.update({
      where: { id: groupId },
      data: { status: dto.status },
      include: { options: { orderBy: { displayOrder: 'asc' } } },
    });
    return this.presentModifierGroup(group);
  }

  async createModifierOption(groupId: string, dto: UpsertModifierOptionDto) {
    await this.findModifierGroup(groupId);
    const option = await this.prisma.productModifierOption.create({
      data: {
        groupId,
        name: this.cleanName(dto.name, 'Modifier option name is required.'),
        priceDelta: dto.priceDelta,
        status: dto.status ?? ModifierOptionStatus.ACTIVE,
        displayOrder: dto.sortOrder ?? 0,
      },
    });
    return this.presentModifierOption(option);
  }

  async updateModifierOption(optionId: string, dto: UpsertModifierOptionDto) {
    await this.findModifierOption(optionId);
    const option = await this.prisma.productModifierOption.update({
      where: { id: optionId },
      data: {
        name: this.cleanName(dto.name, 'Modifier option name is required.'),
        priceDelta: dto.priceDelta,
        status: dto.status ?? ModifierOptionStatus.ACTIVE,
        displayOrder: dto.sortOrder ?? 0,
      },
    });
    return this.presentModifierOption(option);
  }

  async updateModifierOptionStatus(optionId: string, dto: UpdateModifierOptionStatusDto) {
    await this.findModifierOption(optionId);
    const option = await this.prisma.productModifierOption.update({
      where: { id: optionId },
      data: { status: dto.status },
    });
    return this.presentModifierOption(option);
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
      type: campaign.type,
      discountType: campaign.discountType,
      discountValue: campaign.discountValue,
      thresholdAmount: campaign.thresholdAmount ? toMoneyNumber(campaign.thresholdAmount) : null,
      promoCode: campaign.promoCode,
      productId: campaign.productId,
      categoryName: campaign.categoryName,
      startsAt: campaign.startsAt?.toISOString() ?? null,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      customerEligibilityMode: campaign.customerEligibilityMode,
      targetCustomerSegmentId: campaign.targetCustomerSegmentId,
      stackingPolicy: campaign.stackingPolicy,
      usageLimit: campaign.usageLimit,
      usageCount: campaign.usageCount,
      discountTotal: toMoneyNumber(campaign.discountTotal),
      timeWindow: campaign.timeWindow,
      category: this.inferCampaignCategory(campaign.structuredJson),
      status: campaign.status,
      createdAt: campaign.createdAt.toISOString(),
    }));
  }

  async createCampaign(dto: UpsertCampaignDto) {
    const storeId = this.storeContext.getStoreId();
    await this.assertCampaignCustomerTarget(storeId, dto);
    const validPeriod = this.parseCampaignValidPeriod(dto);
    const campaign = await this.prisma.campaign.create({
      data: {
        storeId,
        name: dto.name.trim(),
        goal: dto.goal,
        type: dto.type as CampaignType,
        status: CampaignStatus.DRAFT,
        discountType: dto.discountType ?? 'percentage',
        discountValue: dto.discountValue,
        thresholdAmount: dto.thresholdAmount,
        promoCode: dto.promoCode?.trim().toUpperCase(),
        productId: dto.productId,
        categoryName: dto.categoryName,
        startsAt: validPeriod.startsAt,
        endsAt: validPeriod.endsAt,
        customerEligibilityMode: (dto.customerEligibilityMode ?? CustomerEligibilityMode.ALL_CUSTOMERS) as CustomerEligibilityMode,
        targetCustomerSegmentId: dto.customerEligibilityMode === CustomerEligibilityMode.SEGMENT_ONLY ? dto.targetCustomerSegmentId : null,
        stackingPolicy: (dto.stackingPolicy ?? PromotionStackingPolicy.BEST_ONLY) as PromotionStackingPolicy,
        priority: dto.priority ?? 0,
        usageLimit: dto.usageLimit,
        structuredJson: { source: 'admin_promotion_engine' } as Prisma.InputJsonValue,
      },
    });
    return this.getCampaign(campaign.id);
  }

  async updateCampaign(id: string, dto: UpsertCampaignDto) {
    const campaign = await this.findCampaign(id);
    await this.assertCampaignCustomerTarget(campaign.storeId, dto);
    const validPeriod = this.parseCampaignValidPeriod(dto);
    await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        goal: dto.goal,
        type: dto.type as CampaignType,
        discountType: dto.discountType ?? 'percentage',
        discountValue: dto.discountValue,
        thresholdAmount: dto.thresholdAmount,
        promoCode: dto.promoCode?.trim().toUpperCase(),
        productId: dto.productId,
        categoryName: dto.categoryName,
        startsAt: validPeriod.startsAt,
        endsAt: validPeriod.endsAt,
        customerEligibilityMode: (dto.customerEligibilityMode ?? CustomerEligibilityMode.ALL_CUSTOMERS) as CustomerEligibilityMode,
        targetCustomerSegmentId: dto.customerEligibilityMode === CustomerEligibilityMode.SEGMENT_ONLY ? dto.targetCustomerSegmentId : null,
        stackingPolicy: (dto.stackingPolicy ?? PromotionStackingPolicy.BEST_ONLY) as PromotionStackingPolicy,
        priority: dto.priority ?? 0,
        usageLimit: dto.usageLimit,
      },
    });
    return this.getCampaign(id);
  }

  async updateCampaignStatus(id: string, dto: UpdateCampaignStatusDto) {
    await this.findCampaign(id);
    await this.prisma.campaign.update({ where: { id }, data: { status: dto.status as CampaignStatus } });
    return this.getCampaign(id);
  }

  private async getCampaign(id: string) {
    const campaign = await this.findCampaign(id);
    return {
      id: campaign.id,
      name: campaign.name,
      goal: campaign.goal,
      type: campaign.type,
      discountType: campaign.discountType,
      discountValue: campaign.discountValue,
      thresholdAmount: campaign.thresholdAmount ? toMoneyNumber(campaign.thresholdAmount) : null,
      promoCode: campaign.promoCode,
      productId: campaign.productId,
      categoryName: campaign.categoryName,
      startsAt: campaign.startsAt?.toISOString() ?? null,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      customerEligibilityMode: campaign.customerEligibilityMode,
      targetCustomerSegmentId: campaign.targetCustomerSegmentId,
      stackingPolicy: campaign.stackingPolicy,
      usageLimit: campaign.usageLimit,
      usageCount: campaign.usageCount,
      discountTotal: toMoneyNumber(campaign.discountTotal),
      timeWindow: campaign.timeWindow,
      category: this.inferCampaignCategory(campaign.structuredJson),
      status: campaign.status,
      createdAt: campaign.createdAt.toISOString(),
    };
  }

  private async findCampaign(id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, storeId: this.storeContext.getStoreId() } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    return campaign;
  }

  private async assertCampaignCustomerTarget(storeId: string, dto: UpsertCampaignDto) {
    const mode = (dto.customerEligibilityMode ?? CustomerEligibilityMode.ALL_CUSTOMERS) as CustomerEligibilityMode;
    if (mode === CustomerEligibilityMode.SEGMENT_ONLY && !dto.targetCustomerSegmentId) {
      throw new BadRequestException('SEGMENT_ONLY campaign requires targetCustomerSegmentId.');
    }
    if (dto.targetCustomerSegmentId) {
      const segment = await this.prisma.customerSegment.findFirst({
        where: { id: dto.targetCustomerSegmentId, storeId },
      });
      if (!segment) {
        throw new BadRequestException('Target customer segment does not belong to the active store.');
      }
    }
  }

  private parseCampaignValidPeriod(dto: Pick<UpsertCampaignDto, 'startsAt' | 'endsAt'>) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException('Campaign endsAt must be later than startsAt.');
    }
    return { startsAt, endsAt };
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

  private async findProduct(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, storeId: this.storeContext.getStoreId() },
      include: this.productDetailInclude(),
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  private async findCategory(id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, storeId: this.storeContext.getStoreId() } });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return category;
  }

  private async resolveCategory(categoryId?: string) {
    if (!categoryId) {
      return null;
    }
    return this.findCategory(categoryId);
  }

  private async resolveKitchenStation(kitchenStationId?: string) {
    if (!kitchenStationId) {
      return null;
    }
    const station = await this.prisma.kitchenStation.findFirst({
      where: {
        id: kitchenStationId,
        storeId: this.storeContext.getStoreId(),
        status: KitchenStationStatus.ACTIVE,
      },
    });
    if (!station) {
      throw new NotFoundException('Kitchen station not found.');
    }
    return station;
  }

  private async findModifierGroup(id: string) {
    const group = await this.prisma.productModifierGroup.findFirst({
      where: { id, product: { storeId: this.storeContext.getStoreId() } },
      include: { options: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!group) {
      throw new NotFoundException('Modifier group not found.');
    }
    return group;
  }

  private async findModifierOption(id: string) {
    const option = await this.prisma.productModifierOption.findFirst({
      where: { id, group: { product: { storeId: this.storeContext.getStoreId() } } },
    });
    if (!option) {
      throw new NotFoundException('Modifier option not found.');
    }
    return option;
  }

  private productDetailInclude() {
    return {
      categoryRef: true,
      kitchenStation: true,
      modifierGroups: {
        include: { options: { orderBy: { displayOrder: 'asc' as const } } },
        orderBy: { displayOrder: 'asc' as const },
      },
    };
  }

  private presentProductDetail(product: Prisma.ProductGetPayload<{ include: ReturnType<AdminService['productDetailInclude']> }>) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.categoryRef ? { id: product.categoryRef.id, name: product.categoryRef.name } : null,
      categoryName: product.categoryRef?.name ?? product.category,
      kitchenStation: product.kitchenStation
        ? { id: product.kitchenStation.id, name: product.kitchenStation.name, code: product.kitchenStation.code }
        : null,
      price: toMoneyNumber(product.price),
      currency: product.currency,
      status: product.isActive ? 'ACTIVE' : 'INACTIVE',
      availabilityStatus: product.availabilityStatus,
      modifierCount: product.modifierGroups.length,
      modifierGroups: product.modifierGroups.map((group) => this.presentModifierGroup(group)),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private presentModifierGroup(group: {
    id: string;
    name: string;
    required: boolean;
    multiSelect: boolean;
    minSelect: number;
    maxSelect: number;
    status: CatalogStatus;
    displayOrder: number;
    options: Array<{
      id: string;
      name: string;
      priceDelta: Prisma.Decimal;
      status: ModifierOptionStatus;
      displayOrder: number;
    }>;
  }) {
    return {
      id: group.id,
      name: group.name,
      required: group.required,
      selectionType: group.multiSelect ? 'MULTI' : 'SINGLE',
      multiSelect: group.multiSelect,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      status: group.status,
      sortOrder: group.displayOrder,
      options: group.options.map((option) => this.presentModifierOption(option)),
    };
  }

  private presentModifierOption(option: {
    id: string;
    name: string;
    priceDelta: Prisma.Decimal;
    status: ModifierOptionStatus;
    displayOrder: number;
  }) {
    return {
      id: option.id,
      name: option.name,
      priceDelta: toMoneyNumber(option.priceDelta),
      status: option.status,
      sortOrder: option.displayOrder,
    };
  }

  private cleanName(value: string, message: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(message);
    }
    return trimmed;
  }

  private cleanOptional(value?: string) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private normalizeSelection(dto: UpsertModifierGroupDto) {
    const required = Boolean(dto.required);
    const multiSelect = dto.selectionType === 'MULTI';
    let minSelect = dto.minSelect ?? (required ? 1 : 0);
    let maxSelect = dto.maxSelect ?? 1;

    if (!multiSelect) {
      maxSelect = 1;
      minSelect = required ? 1 : 0;
    }
    if (required && minSelect < 1) {
      throw new BadRequestException('Required modifier groups must have minSelect >= 1.');
    }
    if (maxSelect < minSelect) {
      throw new BadRequestException('Modifier maxSelect must be greater than or equal to minSelect.');
    }

    return { required, multiSelect, minSelect, maxSelect };
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
      pinSet: Boolean(staff.user.managerPinHash),
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
