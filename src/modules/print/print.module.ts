import { Module } from '@nestjs/common';

import { ReceiptsModule } from '@/modules/receipts/receipts.module';
import { ShiftsModule } from '@/modules/shifts/shifts.module';

import { LanPrinterAdapter } from './adapters/lan-printer.adapter';
import { AdminPrintController } from './admin-print.controller';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';
import { EscPosRenderer } from './renderers/escpos.renderer';

@Module({
  imports: [ReceiptsModule, ShiftsModule],
  controllers: [AdminPrintController, PrintController],
  providers: [PrintService, EscPosRenderer, LanPrinterAdapter],
  exports: [PrintService],
})
export class PrintModule {}
