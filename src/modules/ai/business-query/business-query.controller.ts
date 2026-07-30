import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { BusinessQueryService } from './business-query.service';
import { BusinessQueryDto } from './dto/business-query.dto';

@ApiTags('admin-ai-business-query')
@Controller('admin/ai')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class BusinessQueryController {
  constructor(private readonly service: BusinessQueryService) {}

  @Post('query')
  @ApiOperation({ summary: 'Ask an evidence-grounded natural-language business question.' })
  ask(@Body() dto: BusinessQueryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.ask(dto, currentUser);
  }

  @Get('query-history')
  @ApiOperation({ summary: 'List recent natural-language business questions.' })
  history(@CurrentUser() currentUser: AuthRequestUser) {
    return this.service.historyFor(currentUser);
  }
}
