import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AiService } from './ai.service';
import { ConfirmMenuDraftDto } from './dto/confirm-menu-draft.dto';
import { CreateMenuDraftDto } from './dto/create-menu-draft.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

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
