import { Module } from '@nestjs/common';

import { CustomersService } from './customers.service';
import { AdminCustomersController, PosCustomersController } from './customers.controller';

@Module({
  controllers: [PosCustomersController, AdminCustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
