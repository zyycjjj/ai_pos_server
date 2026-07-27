import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { StoreRole } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import { LoginDto } from './dto/login.dto';
import { RegisterStoreDto } from './dto/register-store.dto';
import { SwitchStoreDto } from './dto/switch-store.dto';
import { signAuthToken } from './jwt';
import { hashPassword, verifyPassword } from './password';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: {
        stores: {
          where: { active: true, store: { active: true } },
          include: { store: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user || !user.active || !verifyPassword(dto.password, user.passwordHash) || user.stores.length === 0) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.createAuthResponse(user, user.stores[0].storeId);
  }

  async me(userId: string, activeStoreId: string) {
    const user = await this.findActiveUserWithStores(userId);
    return this.createAuthResponse(user, activeStoreId);
  }

  async switchStore(userId: string, dto: SwitchStoreDto) {
    const user = await this.findActiveUserWithStores(userId);
    if (!user.stores.some((storeUser) => storeUser.storeId === dto.storeId)) {
      throw new BadRequestException('User is not a staff member of this store.');
    }
    return this.createAuthResponse(user, dto.storeId);
  }

  async registerStore(dto: RegisterStoreDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email is already registered.');
    }

    const user = await this.prisma.$transaction(
      async (tx) => {
        const store = await tx.store.create({
          data: {
            name: dto.storeName.trim(),
          },
        });
        return tx.user.create({
          data: {
            email,
            name: dto.name?.trim(),
            passwordHash: hashPassword(dto.password),
            stores: {
              create: {
                storeId: store.id,
                role: StoreRole.OWNER,
              },
            },
          },
          include: {
            stores: {
              include: { store: true },
            },
          },
        });
      },
      { timeout: 15_000 },
    );

    return this.createAuthResponse(user, user.stores[0].storeId);
  }

  private async findActiveUserWithStores(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        stores: {
          where: { active: true, store: { active: true } },
          include: { store: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user || !user.active || user.stores.length === 0) {
      throw new UnauthorizedException('Authenticated user is unavailable.');
    }
    return user;
  }

  private createAuthResponse(
    user: Awaited<ReturnType<AuthService['findActiveUserWithStores']>>,
    activeStoreId: string,
  ) {
    const activeMembership = user.stores.find((storeUser) => storeUser.storeId === activeStoreId) ?? user.stores[0];
    const activeStore = activeMembership.store;
    return {
      accessToken: signAuthToken({
        userId: user.id,
        activeStoreId: activeStore.id,
      }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      stores: user.stores.map((storeUser) => ({
        storeId: storeUser.storeId,
        storeName: storeUser.store.name,
        role: storeUser.role,
      })),
      activeStoreId: activeStore.id,
      role: activeMembership.role,
      permissions: this.createPermissions(activeMembership.role),
    };
  }

  private createPermissions(role: StoreRole) {
    if (role === StoreRole.KITCHEN) {
      return ['pos.kitchen.read', 'pos.kitchen.manage', 'pos.settings.read'];
    }

    if (role !== StoreRole.OWNER && role !== StoreRole.MANAGER) {
      return ['pos.sell', 'pos.orders', 'pos.tables', 'pos.settings.read'];
    }

    return [
      'admin.dashboard.read',
      'admin.staff.read',
      'admin.staff.manage',
      'admin.products.read',
      'admin.products.manage',
      'admin.kitchen.read',
      'admin.kitchen.manage',
      'admin.printers.manage',
      'admin.reports.read',
      'pos.kitchen.read',
      'pos.kitchen.manage',
      'admin.campaigns.read',
      'admin.ai.read',
    ];
  }
}
