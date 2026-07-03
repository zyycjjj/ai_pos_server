import { SetMetadata } from '@nestjs/common';
import type { StoreRole } from '@prisma/client';

export const ROLES_KEY = 'storeRoles';

export function Roles(...roles: StoreRole[]) {
  return SetMetadata(ROLES_KEY, roles);
}
