import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/shift.dto';
import { ShiftsService } from './shifts.service';

@ApiTags('shifts')
@Controller('shifts')
@UseGuards(RolesGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('active')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Read current active shift for the signed-in staff member.' })
  getActiveShift(@CurrentUser() currentUser: AuthRequestUser) {
    return this.shiftsService.getActiveShift(currentUser);
  }

  @Post('open')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Open a shift with opening cash.' })
  openShift(@Body() dto: OpenShiftDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.shiftsService.openShift(dto, currentUser);
  }

  @Get()
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'List shifts in the active store.' })
  listShifts() {
    return this.shiftsService.listShifts();
  }

  @Get(':id')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Read shift detail.' })
  getShift(@Param('id') id: string) {
    return this.shiftsService.getShift(id);
  }

  @Post(':id/cash-in')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Record cash in for an open shift.' })
  cashIn(@Param('id') id: string, @Body() dto: CashMovementDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.shiftsService.cashIn(id, dto, currentUser);
  }

  @Post(':id/cash-out')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Record cash out for an open shift.' })
  cashOut(@Param('id') id: string, @Body() dto: CashMovementDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.shiftsService.cashOut(id, dto, currentUser);
  }

  @Post(':id/adjustments')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Record a cash adjustment for an open shift.' })
  adjustment(@Param('id') id: string, @Body() dto: CashMovementDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.shiftsService.adjustment(id, dto, currentUser);
  }

  @Post(':id/close')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Close shift with actual cash count.' })
  closeShift(@Param('id') id: string, @Body() dto: CloseShiftDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.shiftsService.closeShift(id, dto, currentUser);
  }

  @Get(':id/movements')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'List cash movements for a shift.' })
  getMovements(@Param('id') id: string) {
    return this.shiftsService.getMovements(id);
  }
}
