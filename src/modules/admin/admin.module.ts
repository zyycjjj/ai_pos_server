import { Module } from '@nestjs/common';

import { KitchenModule } from '@/modules/kitchen/kitchen.module';
import { ShiftsModule } from '@/modules/shifts/shifts.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [ShiftsModule, KitchenModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
