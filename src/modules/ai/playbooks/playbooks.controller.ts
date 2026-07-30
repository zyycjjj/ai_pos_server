import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { RunPlaybookDto } from './dto/playbook.dto';
import { PlaybooksService } from './playbooks.service';

@ApiTags('admin-ai-playbooks')
@Controller('admin/ai')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class PlaybooksController {
  constructor(private readonly service: PlaybooksService) {}

  @Get('playbooks')
  @ApiOperation({ summary: 'List AI scenario playbooks.' })
  list() {
    return this.service.list();
  }

  @Post('playbooks/:type/run')
  @ApiOperation({ summary: 'Run an AI scenario playbook.' })
  run(@Param('type') type: string, @Body() dto: RunPlaybookDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.service.run(type, dto, currentUser);
  }

  @Get('playbook-runs')
  @ApiOperation({ summary: 'List AI scenario playbook runs.' })
  history() {
    return this.service.history();
  }

  @Get('playbook-runs/:id')
  @ApiOperation({ summary: 'Get an AI scenario playbook run.' })
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }
}
