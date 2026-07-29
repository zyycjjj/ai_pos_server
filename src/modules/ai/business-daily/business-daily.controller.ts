import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { BusinessDailyService } from './business-daily.service';
import { BusinessDailyQueryDto, CreateCampaignDraftFromRecommendationDto } from './dto/business-daily.dto';

@ApiTags('admin-ai-business-daily')
@Controller('admin/ai')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class BusinessDailyController {
  constructor(private readonly service: BusinessDailyService) {}

  @Get('business-daily')
  @ApiOperation({ summary: 'Generate an evidence-grounded AI business daily report.' })
  getBusinessDaily(@Query() query: BusinessDailyQueryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.getBusinessDaily(query, currentUser);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'List evidence-grounded AI recommendation cards.' })
  getRecommendations(@Query() query: BusinessDailyQueryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.getRecommendations(query, currentUser);
  }

  @Post('campaign-drafts')
  @ApiOperation({ summary: 'Create a DRAFT campaign from an AI recommendation.' })
  createCampaignDraft(@Body() dto: CreateCampaignDraftFromRecommendationDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.createCampaignDraft(dto, currentUser);
  }
}
