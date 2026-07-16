import { Module } from '@nestjs/common';

import { PrintModule } from '@/modules/print/print.module';
import { ShiftsModule } from '@/modules/shifts/shifts.module';

import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [ShiftsModule, PrintModule],
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
