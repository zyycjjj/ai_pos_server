import { ForbiddenException } from '@nestjs/common';
import { StoreRole } from '@prisma/client';

import type { AuthRequestUser } from '@/modules/auth/auth.types';
import type { PrismaService } from '@/prisma/prisma.service';

export function canSeeAllKitchenStations(user?: AuthRequestUser) {
  return user?.role === StoreRole.OWNER || user?.role === StoreRole.MANAGER;
}

export function assertKitchenOperator(user?: AuthRequestUser) {
  const allowedRoles: StoreRole[] = [StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF];
  if (!user || !allowedRoles.includes(user.role)) {
    throw new ForbiddenException('Current staff role cannot access kitchen operations.');
  }
}

export async function getPermittedKitchenStationIds(prisma: PrismaService, storeId: string, user?: AuthRequestUser) {
  if (canSeeAllKitchenStations(user)) return null;
  if (!user || user.role !== StoreRole.KITCHEN) return [];
  const assignments = await prisma.kitchenStaffStation.findMany({
    where: { storeId, userId: user.id },
    select: { stationId: true },
  });
  return assignments.map((assignment) => assignment.stationId);
}
