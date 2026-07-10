import { Module } from '@nestjs/common';

import { KitchenModule } from '@/modules/kitchen/kitchen.module';
import { PrintModule } from '@/modules/print/print.module';
import { ShiftsModule } from '@/modules/shifts/shifts.module';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [ShiftsModule, KitchenModule, PrintModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
