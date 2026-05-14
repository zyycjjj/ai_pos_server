import { enhance } from '@zenstackhq/runtime';
import { ClsService } from 'nestjs-cls';

import { PrismaService } from '@/prisma/prisma.service';

export function useZenFactory(...args: unknown[]) {
  const prisma = args[0] as PrismaService;
  const cls = args[1] as ClsService;

  return {
    getEnhancedPrisma: () => enhance(prisma, { user: cls.get('user') }),
  };
}
