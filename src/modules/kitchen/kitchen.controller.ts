import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KitchenPrintMode, KitchenStationStatus, StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { CancelKitchenTicketDto, ListKitchenTicketsDto, UpdateKitchenPrintModeDto, UpdateKitchenStationStatusDto, UpsertKitchenStationDto } from './dto/kitchen.dto';
import { KitchenService } from './kitchen.service';

@ApiTags('kitchen')
@Controller('kitchen')
@UseGuards(RolesGuard)
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('stations')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'List kitchen stations.' })
  listStations() {
    return this.kitchenService.listStations();
  }

  @Get('settings')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Read kitchen mode settings.' })
  getSettings() {
    return this.kitchenService.getSettings();
  }

  @Patch('settings/print-mode')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Update kitchen ticket print mode.' })
  updatePrintMode(@Body() dto: UpdateKitchenPrintModeDto) {
    return this.kitchenService.updatePrintMode(dto.mode as KitchenPrintMode);
  }

  @Post('stations')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Create a kitchen station.' })
  createStation(@Body() dto: UpsertKitchenStationDto) {
    return this.kitchenService.createStation(dto);
  }

  @Patch('stations/:id')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Update a kitchen station.' })
  updateStation(@Param('id') id: string, @Body() dto: UpsertKitchenStationDto) {
    return this.kitchenService.updateStation(id, dto);
  }

  @Patch('stations/:id/status')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Enable or disable a kitchen station.' })
  updateStationStatus(@Param('id') id: string, @Body() dto: UpdateKitchenStationStatusDto) {
    return this.kitchenService.updateStationStatus(id, dto.status as KitchenStationStatus);
  }

  @Patch('stations/:id/default')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Set the default kitchen station.' })
  setDefaultStation(@Param('id') id: string) {
    return this.kitchenService.setDefaultStation(id);
  }

  @Get('tickets')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'List kitchen tickets.' })
  listTickets(@Query() query: ListKitchenTicketsDto) {
    return this.kitchenService.listTickets(query);
  }

  @Get('tickets/:id')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Read kitchen ticket detail.' })
  getTicket(@Param('id') id: string) {
    return this.kitchenService.getTicket(id);
  }

  @Patch('tickets/:id/start')
  @Post('tickets/:id/start')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Start preparing a kitchen ticket.' })
  startTicket(@Param('id') id: string) {
    return this.kitchenService.startTicket(id);
  }

  @Patch('tickets/:id/ready')
  @Post('tickets/:id/ready')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Mark a kitchen ticket ready.' })
  markReady(@Param('id') id: string) {
    return this.kitchenService.markReady(id);
  }

  @Post('tickets/:id/complete')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Complete a kitchen ticket.' })
  completeTicket(@Param('id') id: string) {
    return this.kitchenService.completeTicket(id);
  }

  @Patch('tickets/:id/cancel')
  @Post('tickets/:id/cancel')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Cancel a kitchen ticket.' })
  cancelTicket(@Param('id') id: string, @Body() dto: CancelKitchenTicketDto) {
    return this.kitchenService.cancelTicket(id, dto);
  }
}
