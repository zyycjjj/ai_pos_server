import { Module } from '@nestjs/common';

import { KitchenModule } from '@/modules/kitchen/kitchen.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { PrintModule } from '@/modules/print/print.module';
import { ShiftsModule } from '@/modules/shifts/shifts.module';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [ShiftsModule, KitchenModule, PrintModule, CustomersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
