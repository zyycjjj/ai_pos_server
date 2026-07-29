import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KitchenPrintMode, KitchenStationStatus, StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import {
  CancelKitchenTicketDto,
  ListKitchenTicketHistoryDto,
  ListKitchenTicketsDto,
  UpdateKitchenPrintModeDto,
  UpdateKitchenStationStatusDto,
  UpdateKitchenTicketPriorityDto,
  UpsertKitchenStationDto,
} from './dto/kitchen.dto';
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
  listTickets(@Query() query: ListKitchenTicketsDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.listTickets(query, currentUser);
  }

  @Get('tickets/history')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'List kitchen ticket history.' })
  listTicketHistory(@Query() query: ListKitchenTicketHistoryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.listTicketHistory(query, currentUser);
  }

  @Get('tickets/:id')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Read kitchen ticket detail.' })
  getTicket(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.getTicket(id, currentUser);
  }

  @Get('tickets/:id/preview')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Preview kitchen ticket content without creating a print job.' })
  previewTicket(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.previewTicket(id, currentUser);
  }

  @Patch('tickets/:id/start')
  @Post('tickets/:id/start')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Start preparing a kitchen ticket.' })
  startTicket(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.startTicket(id, currentUser);
  }

  @Patch('tickets/:id/ready')
  @Post('tickets/:id/ready')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Mark a kitchen ticket ready.' })
  markReady(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.markReady(id, currentUser);
  }

  @Post('tickets/:id/complete')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Complete a kitchen ticket.' })
  completeTicket(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.completeTicket(id, currentUser);
  }

  @Patch('tickets/:id/cancel')
  @Post('tickets/:id/cancel')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Cancel a kitchen ticket.' })
  cancelTicket(@Param('id') id: string, @Body() dto: CancelKitchenTicketDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.cancelTicket(id, dto, currentUser);
  }

  @Post('tickets/:id/rush')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Mark a kitchen ticket urgent.' })
  rushTicket(@Param('id') id: string, @Body() dto: UpdateKitchenTicketPriorityDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.rushTicket(id, dto, currentUser);
  }

  @Post('tickets/:id/unrush')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.STAFF)
  @ApiOperation({ summary: 'Remove urgent priority from a kitchen ticket.' })
  unrushTicket(@Param('id') id: string, @Body() dto: UpdateKitchenTicketPriorityDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.kitchenService.unrushTicket(id, dto, currentUser);
  }
}
