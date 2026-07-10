import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrinterStatus, StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { ListPrintJobsDto, UpdatePrinterStatusDto, UpsertPrinterDto, UpsertPrinterRouteDto } from './dto/print.dto';
import { PrintService } from './print.service';

@ApiTags('admin-printers')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class AdminPrintController {
  constructor(private readonly printService: PrintService) {}

  @Get('printers')
  @ApiOperation({ summary: 'List printers.' })
  listPrinters() {
    return this.printService.listPrinters();
  }

  @Post('printers')
  @ApiOperation({ summary: 'Create printer.' })
  createPrinter(@Body() dto: UpsertPrinterDto) {
    return this.printService.createPrinter(dto);
  }

  @Patch('printers/:id')
  @ApiOperation({ summary: 'Update printer.' })
  updatePrinter(@Param('id') id: string, @Body() dto: UpsertPrinterDto) {
    return this.printService.updatePrinter(id, dto);
  }

  @Patch('printers/:id/status')
  @ApiOperation({ summary: 'Enable or disable printer.' })
  updatePrinterStatus(@Param('id') id: string, @Body() dto: UpdatePrinterStatusDto) {
    return this.printService.updatePrinterStatus(id, dto.status as PrinterStatus);
  }

  @Post('printers/:id/test')
  @ApiOperation({ summary: 'Create a test print job.' })
  testPrint(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.testPrint(id, currentUser);
  }

  @Get('printer-routes')
  @ApiOperation({ summary: 'List printer routes.' })
  listRoutes() {
    return this.printService.listRoutes();
  }

  @Post('printer-routes')
  @ApiOperation({ summary: 'Create or update printer route.' })
  upsertRoute(@Body() dto: UpsertPrinterRouteDto) {
    return this.printService.upsertRoute(dto);
  }

  @Patch('printer-routes/:id')
  @ApiOperation({ summary: 'Update printer route.' })
  updateRoute(@Param('id') _id: string, @Body() dto: UpsertPrinterRouteDto) {
    return this.printService.upsertRoute(dto);
  }

  @Delete('printer-routes/:id')
  @ApiOperation({ summary: 'Delete printer route.' })
  deleteRoute(@Param('id') id: string) {
    return this.printService.deleteRoute(id);
  }

  @Get('print-jobs')
  @ApiOperation({ summary: 'List print jobs.' })
  listJobs(@Query() query: ListPrintJobsDto) {
    return this.printService.listJobs(query);
  }

  @Get('print-jobs/:id')
  @ApiOperation({ summary: 'Read print job detail.' })
  getJob(@Param('id') id: string) {
    return this.printService.getJob(id);
  }

  @Post('print-jobs/:id/retry')
  @ApiOperation({ summary: 'Retry a failed print job.' })
  retryJob(@Param('id') id: string) {
    return this.printService.retryJob(id);
  }
}
