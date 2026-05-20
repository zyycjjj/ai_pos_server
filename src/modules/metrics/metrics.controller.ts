import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('today')
  @ApiOperation({ summary: 'Get POS home metrics for today.' })
  getTodaySummary() {
    return this.metricsService.getTodaySummary();
  }
}
