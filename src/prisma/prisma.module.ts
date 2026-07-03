import { Global, Module } from '@nestjs/common';

import { StoreContextService } from '@/common/store-context.service';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, StoreContextService],
  exports: [PrismaService, StoreContextService],
})
export class PrismaModule {}
