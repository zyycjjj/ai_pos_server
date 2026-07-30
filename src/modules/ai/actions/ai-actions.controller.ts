import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { AiActionsService } from './ai-actions.service';
import { CreateAiActionDto, ListAiActionsQueryDto, UpdateAiActionDto } from './dto/ai-action.dto';

@ApiTags('admin-ai-actions')
@Controller('admin/ai/actions')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class AiActionsController {
  constructor(private readonly service: AiActionsService) {}

  @Post()
  @ApiOperation({ summary: 'Save an AI suggested action as an action item.' })
  create(@Body() dto: CreateAiActionDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.create(dto, currentUser);
  }

  @Get()
  @ApiOperation({ summary: 'List AI action workspace items.' })
  list(@Query() query: ListAiActionsQueryDto) {
    return this.service.list(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update AI action status.' })
  update(@Param('id') id: string, @Body() dto: UpdateAiActionDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.update(id, dto, currentUser);
  }

  @Post(':id/create-campaign-draft')
  @ApiOperation({ summary: 'Create a DRAFT campaign from an AI campaign action.' })
  createCampaignDraft(@Param('id') id: string, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.createCampaignDraft(id, currentUser);
  }
}
