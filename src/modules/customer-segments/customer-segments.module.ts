import { Module } from '@nestjs/common';

import { CustomerSegmentsController } from './customer-segments.controller';
import { CustomerSegmentsService } from './customer-segments.service';

@Module({
  controllers: [CustomerSegmentsController],
  providers: [CustomerSegmentsService],
  exports: [CustomerSegmentsService],
})
export class CustomerSegmentsModule {}
