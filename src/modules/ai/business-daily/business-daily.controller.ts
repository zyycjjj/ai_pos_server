import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { BusinessDailyService } from './business-daily.service';
import { BusinessDailyQueryDto, CreateCampaignDraftFromRecommendationDto } from './dto/business-daily.dto';
import { BossDashboardService } from '../boss-dashboard/boss-dashboard.service';
import { BossDashboardQueryDto, WeeklyInsightQueryDto } from '../boss-dashboard/dto/boss-dashboard.dto';
import { CampaignRecommendationService } from '../campaign-recommendation/campaign-recommendation.service';

@ApiTags('admin-ai-business-daily')
@Controller('admin/ai')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class BusinessDailyController {
  constructor(
    private readonly service: BusinessDailyService,
    private readonly campaignRecommendations: CampaignRecommendationService,
    private readonly bossDashboard: BossDashboardService,
  ) {}

  @Get('business-daily')
  @ApiOperation({ summary: 'Generate an evidence-grounded AI business daily report.' })
  getBusinessDaily(@Query() query: BusinessDailyQueryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.getBusinessDaily(query, currentUser);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'List evidence-grounded AI recommendation cards.' })
  getRecommendations(@Query() query: BusinessDailyQueryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.campaignRecommendations.recommendations(query, currentUser);
  }

  @Post('campaign-drafts')
  @ApiOperation({ summary: 'Create a DRAFT campaign from an AI recommendation.' })
  createCampaignDraft(@Body() dto: CreateCampaignDraftFromRecommendationDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.campaignRecommendations.createDraft(dto, currentUser);
  }

  @Get('boss-dashboard')
  @ApiOperation({ summary: 'Generate an evidence-grounded AI boss dashboard.' })
  getBossDashboard(@Query() query: BossDashboardQueryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.bossDashboard.getDashboard(query, currentUser);
  }

  @Get('weekly-insight')
  @ApiOperation({ summary: 'Generate an evidence-grounded AI weekly insight.' })
  getWeeklyInsight(@Query() query: WeeklyInsightQueryDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.bossDashboard.getWeeklyInsight(query, currentUser);
  }
}
