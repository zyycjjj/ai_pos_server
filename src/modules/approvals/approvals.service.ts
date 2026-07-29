import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StoreRole } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { hasActionPermission, type ActionPermission } from '@/modules/permissions/action-permission';
import { StorePermissionPolicyService } from '@/modules/permissions/store-permission-policy.service';

import { ManagerApprovalDto, SetManagerPinDto } from './dto/manager-approval.dto';
import { ManagerPinService } from './manager-pin.service';

export type ApprovalRequirement = {
  action: ActionPermission;
  amount?: number;
  currentUser?: AuthRequestUser;
  managerApproval?: ManagerApprovalDto;
  approval?: ManagerApprovalDto;
  force?: boolean;
};

export type ApprovalResult = {
  approvedById?: string;
  reason?: string;
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pinService: ManagerPinService,
    private readonly policyService: StorePermissionPolicyService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async setOwnPin(dto: SetManagerPinDto, currentUser: AuthRequestUser) {
    this.assertCanHoldManagerPin(currentUser);
    const { hash, salt } = this.pinService.hashPin(dto.pin);
    await this.prisma.user.update({
      where: { id: currentUser.id },
      data: { managerPinHash: hash, managerPinSalt: salt, managerPinUpdatedAt: new Date() },
    });
    return { pinSet: true };
  }

  async resetStaffPin(staffMembershipId: string, dto: SetManagerPinDto, currentUser: AuthRequestUser) {
    if (!hasActionPermission(currentUser.role, 'STAFF_MANAGE')) {
      throw new ForbiddenException('Staff management permission is required.');
    }
    const storeId = this.getStoreId();
    const staff = await this.prisma.storeUser.findFirst({
      where: { id: staffMembershipId, storeId },
      include: { user: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found.');
    }
    if (staff.role !== StoreRole.OWNER && staff.role !== StoreRole.MANAGER) {
      throw new BadRequestException('Only owner or manager staff can hold a manager PIN.');
    }
    const { hash, salt } = this.pinService.hashPin(dto.pin);
    await this.prisma.user.update({
      where: { id: staff.userId },
      data: { managerPinHash: hash, managerPinSalt: salt, managerPinUpdatedAt: new Date() },
    });
    return { id: staff.id, userId: staff.userId, pinSet: true };
  }

  async requireApproval(input: ApprovalRequirement): Promise<ApprovalResult> {
    const currentUser = input.currentUser;
    if (!currentUser) {
      throw new ForbiddenException('Authenticated user is required.');
    }
    if (!hasActionPermission(currentUser.role, input.action)) {
      throw new ForbiddenException(`Permission denied for ${input.action}.`);
    }
    const requiresApproval = input.force || (await this.requiresPolicyApproval(input));
    if (!requiresApproval) return {};

    const approval = input.managerApproval ?? input.approval;
    if (!approval?.managerUserId || !approval.pin || !approval.reason?.trim()) {
      throw new BadRequestException({
        code: 'MANAGER_APPROVAL_REQUIRED',
        message: 'Manager approval with managerUserId, pin, and reason is required.',
      });
    }

    const manager = await this.prisma.storeUser.findFirst({
      where: {
        storeId: this.getStoreId(),
        userId: approval.managerUserId,
        active: true,
        role: { in: [StoreRole.OWNER, StoreRole.MANAGER] },
        user: { active: true },
      },
      include: { user: true },
    });
    if (!manager || !hasActionPermission(manager.role, 'MANAGER_APPROVE')) {
      throw new ForbiddenException({
        code: 'MANAGER_APPROVAL_INVALID',
        message: 'Manager is not permitted to approve this action.',
      });
    }
    if (!this.pinService.verifyPin(approval.pin, manager.user.managerPinSalt, manager.user.managerPinHash)) {
      throw new ForbiddenException({
        code: 'MANAGER_APPROVAL_INVALID',
        message: 'Manager PIN is invalid.',
      });
    }
    return { approvedById: manager.userId, reason: approval.reason.trim() };
  }

  async checkApproval(input: ApprovalRequirement) {
    const approval = await this.requireApproval(input);
    return { approved: true, approvedById: approval.approvedById };
  }

  private async requiresPolicyApproval(input: ApprovalRequirement) {
    const currentUser = input.currentUser;
    if (!currentUser) return true;
    if (currentUser.role === StoreRole.OWNER || currentUser.role === StoreRole.MANAGER) return false;
    if (currentUser.role !== StoreRole.CASHIER && currentUser.role !== StoreRole.KITCHEN) return false;

    const policy = await this.policyService.getPolicy(this.getStoreId());
    const amount = input.amount ?? 0;
    switch (input.action) {
      case 'ORDER_REFUND':
        return policy.refundRequiresApproval && amount >= policy.refundApprovalThreshold;
      case 'ORDER_VOID':
        return policy.voidRequiresApproval;
      case 'ORDER_MANUAL_DISCOUNT':
        return amount > policy.manualDiscountApprovalThreshold;
      case 'CASH_MOVEMENT_OUT':
        return amount > policy.cashOutApprovalThreshold;
      case 'TABLE_CANCEL_PREPARED_ITEM':
      case 'KITCHEN_CANCEL':
        return policy.preparedItemCancelRequiresApproval;
      default:
        return false;
    }
  }

  private assertCanHoldManagerPin(currentUser: AuthRequestUser) {
    if (currentUser.role !== StoreRole.OWNER && currentUser.role !== StoreRole.MANAGER) {
      throw new ForbiddenException('Only owner or manager staff can set a manager PIN.');
    }
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
