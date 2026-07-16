import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { BusinessDayService } from './business-day.service';
import { CloseBusinessDayDto, OpenBusinessDayDto } from './dto/business-day.dto';

@ApiTags('business-day')
@Controller('business-day')
@UseGuards(RolesGuard)
export class BusinessDayController {
  constructor(private readonly businessDayService: BusinessDayService) {}

  @Get('current')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.STAFF)
  @ApiOperation({ summary: 'Read current open business day for the store.' })
  current() {
    return this.businessDayService.current();
  }

  @Get()
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'List recent business days.' })
  list() {
    return this.businessDayService.list();
  }

  @Post('open')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Open the current business day. One open day per store.' })
  open(@Body() dto: OpenBusinessDayDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.businessDayService.open(dto, currentUser);
  }

  @Post(':id/close')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Close an open business day with sales/refund summary.' })
  close(@Param('id') id: string, @Body() dto: CloseBusinessDayDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.businessDayService.close(id, dto, currentUser);
  }
}
