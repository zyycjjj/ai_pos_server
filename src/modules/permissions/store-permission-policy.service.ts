import { Injectable } from '@nestjs/common';
import type { StorePermissionPolicy } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import type { UpdatePermissionPolicyDto } from './dto/permission-policy.dto';

export type PermissionPolicyView = {
  refundRequiresApproval: boolean;
  voidRequiresApproval: boolean;
  preparedItemCancelRequiresApproval: boolean;
  manualDiscountApprovalThreshold: number;
  cashOutApprovalThreshold: number;
  refundApprovalThreshold: number;
};

export const defaultPermissionPolicy: PermissionPolicyView = {
  refundRequiresApproval: true,
  voidRequiresApproval: true,
  preparedItemCancelRequiresApproval: true,
  manualDiscountApprovalThreshold: 10,
  cashOutApprovalThreshold: 100,
  refundApprovalThreshold: 0,
};

@Injectable()
export class StorePermissionPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async getPolicy(storeId = this.getStoreId()) {
    const policy = await this.prisma.storePermissionPolicy.upsert({
      where: { storeId },
      update: {},
      create: { storeId },
    });
    return this.present(policy);
  }

  async updatePolicy(dto: UpdatePermissionPolicyDto, storeId = this.getStoreId()) {
    const policy = await this.prisma.storePermissionPolicy.upsert({
      where: { storeId },
      create: { storeId, ...this.cleanInput(dto) },
      update: this.cleanInput(dto),
    });
    return this.present(policy);
  }

  present(policy?: StorePermissionPolicy | null): PermissionPolicyView {
    if (!policy) return defaultPermissionPolicy;
    return {
      refundRequiresApproval: policy.refundRequiresApproval,
      voidRequiresApproval: policy.voidRequiresApproval,
      preparedItemCancelRequiresApproval: policy.preparedItemCancelRequiresApproval,
      manualDiscountApprovalThreshold: toMoneyNumber(policy.manualDiscountApprovalThreshold),
      cashOutApprovalThreshold: toMoneyNumber(policy.cashOutApprovalThreshold),
      refundApprovalThreshold: toMoneyNumber(policy.refundApprovalThreshold),
    };
  }

  private cleanInput(dto: UpdatePermissionPolicyDto) {
    return {
      refundRequiresApproval: dto.refundRequiresApproval,
      voidRequiresApproval: dto.voidRequiresApproval,
      preparedItemCancelRequiresApproval: dto.preparedItemCancelRequiresApproval,
      manualDiscountApprovalThreshold: dto.manualDiscountApprovalThreshold,
      cashOutApprovalThreshold: dto.cashOutApprovalThreshold,
      refundApprovalThreshold: dto.refundApprovalThreshold,
    };
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
