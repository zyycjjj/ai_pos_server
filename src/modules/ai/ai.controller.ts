import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { AiCampaignService } from './campaign.service';
import { AiJobService } from './ai-job.service';
import { AiService } from './ai.service';
import { ConfirmMenuDraftDto } from './dto/confirm-menu-draft.dto';
import { CreateMenuDraftDto } from './dto/create-menu-draft.dto';
import { GenerateCampaignDto } from './dto/generate-campaign.dto';
import { GenerateMenuDto } from './dto/generate-menu.dto';
import { ImportMenuDto } from './dto/import-menu.dto';

@ApiTags('ai')
@Controller('ai')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiCampaignService: AiCampaignService,
    private readonly aiJobService: AiJobService,
  ) {}

  @Get('menu-drafts')
  @ApiOperation({ summary: 'List recent AI menu drafts.' })
  listDrafts() {
    return this.aiService.listDrafts();
  }

  @Post('menu-drafts')
  @ApiOperation({ summary: 'Generate a structured AI menu draft without writing products.' })
  createMenuDraft(@Body() dto: CreateMenuDraftDto) {
    return this.aiService.createMenuDraft(dto);
  }

  @Post('menu/generate')
  @ApiOperation({ summary: 'Generate a reviewed AI menu preview without writing products.' })
  generateMenu(@Body() dto: GenerateMenuDto) {
    return this.aiService.generateMenu(dto);
  }

  @Post('menu/generate-jobs')
  @ApiOperation({ summary: 'Start an async AI menu generation job.' })
  startMenuGenerationJob(@Body() dto: GenerateMenuDto) {
    return this.aiJobService.startMenuGeneration(dto);
  }

  @Get('menu/generate-jobs/:id')
  @ApiOperation({ summary: 'Read an async AI menu generation job.' })
  getMenuGenerationJob(@Param('id') id: string) {
    const job = this.aiJobService.getJob(id);
    if (!job || job.kind !== 'menu') {
      throw new NotFoundException('AI menu generation job not found.');
    }
    return job;
  }

  @Post('menu/import')
  @ApiOperation({ summary: 'Import reviewed AI menu products after merchant preview.' })
  importMenu(@Body() dto: ImportMenuDto) {
    return this.aiService.importMenu(dto);
  }

  @Post('campaign/generate')
  @ApiOperation({ summary: 'Generate an AI campaign draft from business goal and sales summary.' })
  generateCampaign(@Body() dto: GenerateCampaignDto) {
    return this.aiCampaignService.generateCampaign(dto);
  }

  @Post('campaign/generate-jobs')
  @ApiOperation({ summary: 'Start an async AI campaign generation job.' })
  startCampaignGenerationJob(@Body() dto: GenerateCampaignDto) {
    return this.aiJobService.startCampaignGeneration(dto);
  }

  @Get('campaign/generate-jobs/:id')
  @ApiOperation({ summary: 'Read an async AI campaign generation job.' })
  getCampaignGenerationJob(@Param('id') id: string) {
    const job = this.aiJobService.getJob(id);
    if (!job || job.kind !== 'campaign') {
      throw new NotFoundException('AI campaign generation job not found.');
    }
    return job;
  }

  @Patch('menu-drafts/:id/confirm')
  @ApiOperation({ summary: 'Confirm a draft and write reviewed menu items to products.' })
  confirmMenuDraft(@Param('id') id: string, @Body() dto: ConfirmMenuDraftDto) {
    return this.aiService.confirmMenuDraft(id, dto);
  }

  @Patch('menu-drafts/:id/discard')
  @ApiOperation({ summary: 'Discard a draft without writing products.' })
  discardDraft(@Param('id') id: string) {
    return this.aiService.discardDraft(id);
  }
}
