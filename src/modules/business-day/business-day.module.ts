import { Module } from '@nestjs/common';

import { BusinessDayController } from './business-day.controller';
import { BusinessDayService } from './business-day.service';

@Module({
  controllers: [BusinessDayController],
  providers: [BusinessDayService],
})
export class BusinessDayModule {}
