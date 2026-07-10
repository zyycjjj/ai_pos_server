import { Module } from '@nestjs/common';

import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { OperationsAnalyticsRepository } from './repositories/operations-analytics.repository';
import { PerformanceAnalyticsRepository } from './repositories/performance-analytics.repository';
import { SalesAnalyticsRepository } from './repositories/sales-analytics.repository';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SalesAnalyticsRepository, PerformanceAnalyticsRepository, OperationsAnalyticsRepository],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
