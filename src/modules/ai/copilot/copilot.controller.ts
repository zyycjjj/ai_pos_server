import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { CopilotApplicationService } from './copilot.application.service';
import { CopilotChatDto } from './dto/copilot-chat.dto';
import { DailyBriefService } from './daily-brief.service';

@ApiTags('admin-ai-copilot')
@Controller('admin/ai/copilot')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class CopilotController {
  constructor(
    private readonly copilot: CopilotApplicationService,
    private readonly dailyBrief: DailyBriefService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List AI business copilot conversations for the current user and active store.' })
  listConversations(@CurrentUser() user: AuthRequestUser) {
    return this.copilot.listConversations(user);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Read a store-isolated AI business copilot conversation.' })
  getConversation(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
    return this.copilot.getConversation(user, id);
  }

  @Get('daily-brief')
  @ApiOperation({ summary: 'Read a deterministic daily business brief from Analytics context.' })
  brief() {
    return this.dailyBrief.brief();
  }

  @Post('chat')
  @ApiOperation({ summary: 'Ask the store-aware AI business copilot a grounded business question.' })
  chat(@Body() dto: CopilotChatDto, @CurrentUser() user: AuthRequestUser) {
    return this.copilot.chat(dto, user);
  }
}

