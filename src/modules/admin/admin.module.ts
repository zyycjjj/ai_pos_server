import { Module } from '@nestjs/common';

import { ShiftsModule } from '@/modules/shifts/shifts.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [ShiftsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
