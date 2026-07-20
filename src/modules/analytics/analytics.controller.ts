import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, ProductAnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('admin-analytics')
@Controller('admin/analytics')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Read comparable sales metrics for the active store.' })
  overview(@Query() query: AnalyticsQueryDto) { return this.analytics.overview(query); }

  @Get('daily')
  @ApiOperation({ summary: 'Read daily sales trend in the store timezone.' })
  daily(@Query() query: AnalyticsQueryDto) { return this.analytics.daily(query); }

  @Get('hourly')
  @ApiOperation({ summary: 'Read hourly sales performance in the store timezone.' })
  hourly(@Query() query: AnalyticsQueryDto) { return this.analytics.hourly(query); }

  @Get('products')
  @ApiOperation({ summary: 'Read product performance and comparable growth.' })
  products(@Query() query: ProductAnalyticsQueryDto) { return this.analytics.products(query); }

  @Get('categories')
  @ApiOperation({ summary: 'Read category revenue share and growth.' })
  categories(@Query() query: AnalyticsQueryDto) { return this.analytics.categories(query); }

  @Get('modifiers')
  @ApiOperation({ summary: 'Read modifier selection, attach rate, and revenue.' })
  modifiers(@Query() query: AnalyticsQueryDto) { return this.analytics.modifiers(query); }

  @Get('refunds')
  @ApiOperation({ summary: 'Read refund rates, reasons, and affected products.' })
  refunds(@Query() query: AnalyticsQueryDto) { return this.analytics.refunds(query); }

  @Get('shifts')
  @ApiOperation({ summary: 'Read sales, refunds, and cash variance by shift.' })
  shifts(@Query() query: AnalyticsQueryDto) { return this.analytics.shifts(query); }

  @Get('kitchen')
  @ApiOperation({ summary: 'Read kitchen queue and fulfillment metrics by station.' })
  kitchen(@Query() query: AnalyticsQueryDto) { return this.analytics.kitchen(query); }

  @Get('payments')
  @ApiOperation({ summary: 'Read payment-line mix without double-counting split payments.' })
  payments(@Query() query: AnalyticsQueryDto) { return this.analytics.payments(query); }

  @Get('customers')
  @ApiOperation({ summary: 'Read customer repeat purchase and loyalty metrics.' })
  customers(@Query() query: AnalyticsQueryDto) { return this.analytics.customers(query); }

  @Get('signals')
  @ApiOperation({ summary: 'Read deterministic operational insight signals.' })
  signals(@Query() query: AnalyticsQueryDto) { return this.analytics.signals(query); }

  @Get('ai-context')
  @ApiOperation({ summary: 'Read bounded, structured, store-isolated AI business context.' })
  aiContext(@Query() query: AnalyticsQueryDto) { return this.analytics.aiContext(query); }
}
