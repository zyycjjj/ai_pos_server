import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { PrintFailDto, ReprintDto, UpsertPrinterDto } from './dto/print.dto';
import { PrintService } from './print.service';

@ApiTags('print')
@Controller('print')
@UseGuards(RolesGuard)
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Get('printers')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN)
  @ApiOperation({ summary: 'List printers for POS device setup.' })
  listPrinters() {
    return this.printService.listPrinters();
  }

  @Post('printers')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Create a POS printer from device settings.' })
  createPrinter(@Body() dto: UpsertPrinterDto) {
    return this.printService.createPrinter(dto);
  }

  @Post('printers/:id/test')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN)
  @ApiOperation({ summary: 'Create a POS test print job.' })
  testPrint(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.testPrint(id, currentUser);
  }

  @Post('orders/:orderId/receipt')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Create a customer receipt print job.' })
  printOrderReceipt(@Param('orderId') orderId: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.printOrderReceipt(orderId, currentUser);
  }

  @Post('orders/:orderId/reprint')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Reprint the latest customer receipt snapshot for an order.' })
  reprintOrderReceipt(@Param('orderId') orderId: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.reprintOrderReceipt(orderId, currentUser);
  }

  @Post('kitchen-tickets/:ticketId')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Create a kitchen ticket print job.' })
  printKitchenTicket(@Param('ticketId') ticketId: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.printKitchenTicket(ticketId, currentUser);
  }

  @Post('refunds/:refundId')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Create a refund receipt print job.' })
  printRefundReceipt(@Param('refundId') refundId: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.printRefundReceipt(refundId, currentUser);
  }

  @Post('shifts/:shiftId/summary')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Create a shift summary print job.' })
  printShiftSummary(@Param('shiftId') shiftId: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.printShiftSummary(shiftId, currentUser);
  }

  @Post('jobs/:jobId/reprint')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Create a reprint job from an existing print job.' })
  reprintJob(@Param('jobId') jobId: string, @Body() _dto: ReprintDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.printService.reprintJob(jobId, currentUser);
  }

  @Post('jobs/process-pending')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Process pending LAN print jobs.' })
  processPendingJobs() {
    return this.printService.processPendingJobs();
  }

  @Get('device/jobs')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'List pending local device print jobs.' })
  listDeviceJobs(@Headers('x-device-id') deviceId?: string) {
    return this.printService.listDeviceJobs(deviceId ?? 'unknown-device');
  }

  @Post('device/jobs/:id/claim')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Claim a local device print job.' })
  claimDeviceJob(@Param('id') id: string, @Headers('x-device-id') deviceId?: string) {
    return this.printService.claimDeviceJob(id, deviceId ?? 'unknown-device');
  }

  @Post('device/jobs/:id/success')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Mark a local device print job as successful.' })
  completeDeviceJob(@Param('id') id: string, @Headers('x-device-id') deviceId?: string) {
    return this.printService.completeDeviceJob(id, deviceId ?? 'unknown-device');
  }

  @Post('device/jobs/:id/fail')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Mark a local device print job as failed.' })
  failDeviceJob(@Param('id') id: string, @Body() dto: PrintFailDto, @Headers('x-device-id') deviceId?: string) {
    return this.printService.failDeviceJob(id, deviceId ?? 'unknown-device', dto);
  }
}
