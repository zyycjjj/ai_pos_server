import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { ApprovalsService } from './approvals.service';
import { ApprovalCheckDto, SetManagerPinDto } from './dto/manager-approval.dto';

@ApiTags('approvals')
@Controller()
@UseGuards(RolesGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post('staff/me/pin')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Set or rotate the current manager approval PIN.' })
  setOwnPin(@Body() dto: SetManagerPinDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.approvalsService.setOwnPin(dto, currentUser);
  }

  @Post('approvals/check')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.KITCHEN, StoreRole.WAITER, StoreRole.STAFF)
  @ApiOperation({ summary: 'Validate a manager approval payload for a sensitive POS action.' })
  check(@Body() dto: ApprovalCheckDto, @CurrentUser() currentUser: AuthRequestUser) {
    return this.approvalsService.checkApproval({
      action: dto.action as never,
      amount: dto.amount,
      currentUser,
      managerApproval: dto.managerApproval,
      force: true,
    });
  }
}
