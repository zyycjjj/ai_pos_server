import { Injectable } from '@nestjs/common';
import { AiActionPriority, AiActionStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import type { NormalizedAiActionInput } from './ai-actions.types';

@Injectable()
export class AiActionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(storeId: string, userId: string, input: NormalizedAiActionInput) {
    return this.prisma.aiActionItem.create({
      data: {
        storeId,
        createdByUserId: userId,
        assignedToUserId: null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        actionType: input.actionType,
        priority: input.priority,
        status: AiActionStatus.OPEN,
        title: input.title,
        description: input.description,
        reason: input.reason,
        targetType: input.targetType,
        targetId: input.targetId,
        targetUrl: input.targetUrl,
        payloadJson: input.payload as Prisma.InputJsonValue,
        evidenceSnapshotJson: input.evidenceSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findForStore(storeId: string, id: string) {
    return this.prisma.aiActionItem.findFirst({ where: { id, storeId } });
  }

  list(storeId: string, filters: {
    status?: AiActionStatus;
    priority?: AiActionPriority;
    sourceType?: string;
    actionType?: string;
    take?: number;
  }) {
    return this.prisma.aiActionItem.findMany({
      where: {
        storeId,
        status: filters.status,
        priority: filters.priority,
        sourceType: filters.sourceType as never,
        actionType: filters.actionType as never,
      },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
      take: filters.take ?? 50,
    });
  }

  async summary(storeId: string) {
    const [open, high, done, dismissed] = await Promise.all([
      this.prisma.aiActionItem.count({ where: { storeId, status: AiActionStatus.OPEN } }),
      this.prisma.aiActionItem.count({ where: { storeId, status: AiActionStatus.OPEN, priority: AiActionPriority.HIGH } }),
      this.prisma.aiActionItem.count({ where: { storeId, status: AiActionStatus.DONE } }),
      this.prisma.aiActionItem.count({ where: { storeId, status: AiActionStatus.DISMISSED } }),
    ]);
    return { open, high, done, dismissed };
  }
}
