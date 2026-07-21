import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';
import type { Response } from 'express';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import type { ReportExportType, ReportRangeQuery } from './report-range';
import { ReportsService } from './reports.service';

@ApiTags('admin-reports')
@Controller('admin/reports')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get business report summary.' })
  summary(@Query() query: ReportRangeQuery) {
    return this.reportsService.summary(query);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Get sales report metrics.' })
  sales(@Query() query: ReportRangeQuery) {
    return this.reportsService.sales(query);
  }

  @Get('products')
  @ApiOperation({ summary: 'Get product ranking report.' })
  products(@Query() query: ReportRangeQuery) {
    return this.reportsService.products(query);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Get customer ranking report.' })
  customers(@Query() query: ReportRangeQuery) {
    return this.reportsService.customers(query);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Get campaign performance report.' })
  campaigns(@Query() query: ReportRangeQuery) {
    return this.reportsService.campaigns(query);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Get payment method report.' })
  payments(@Query() query: ReportRangeQuery) {
    return this.reportsService.payments(query);
  }

  @Get('shifts')
  @ApiOperation({ summary: 'Get shift reconciliation report.' })
  shifts(@Query() query: ReportRangeQuery) {
    return this.reportsService.shifts(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export a business report as CSV.' })
  async export(@Query() query: ReportRangeQuery, @Res() response: Response) {
    const type = (query.type ?? 'summary') as ReportExportType;
    const csv = await this.reportsService.export(type, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="ai-pos-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(csv);
  }
}
