import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AiCampaignService } from './campaign.service';
import { AiService } from './ai.service';
import { ConfirmMenuDraftDto } from './dto/confirm-menu-draft.dto';
import { CreateMenuDraftDto } from './dto/create-menu-draft.dto';
import { GenerateCampaignDto } from './dto/generate-campaign.dto';
import { GenerateMenuDto } from './dto/generate-menu.dto';
import { ImportMenuDto } from './dto/import-menu.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiCampaignService: AiCampaignService,
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
