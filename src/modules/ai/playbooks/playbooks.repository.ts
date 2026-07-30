import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import { getPlaybookDefinition } from './playbook-definitions';
import type { AiPlaybookResult, AiPlaybookRunSummary, AiPlaybookType } from './playbooks.types';

@Injectable()
export class PlaybooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, userId: string, result: AiPlaybookResult): Promise<AiPlaybookResult> {
    const run = await this.prisma.aiPlaybookRun.create({
      data: {
        id: result.runId,
        storeId,
        userId,
        type: result.type,
        rangeJson: result.range as Prisma.InputJsonObject,
        summaryHeadline: result.summary.headline,
        status: result.summary.status,
        resultJson: result as unknown as Prisma.InputJsonObject,
      },
    });
    return { ...result, runId: run.id };
  }

  async list(storeId: string): Promise<{ items: AiPlaybookRunSummary[] }> {
    const runs = await this.prisma.aiPlaybookRun.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      items: runs.map((run) => ({
        id: run.id,
        type: run.type as AiPlaybookType,
        title: getPlaybookDefinition(run.type)?.title ?? run.type,
        range: readObject(run.rangeJson) as AiPlaybookRunSummary['range'],
        summaryHeadline: run.summaryHeadline,
        status: run.status as AiPlaybookRunSummary['status'],
        createdAt: run.createdAt.toISOString(),
      })),
    };
  }

  async detail(storeId: string, id: string): Promise<AiPlaybookResult> {
    const run = await this.prisma.aiPlaybookRun.findFirst({ where: { id, storeId } });
    if (!run) throw new NotFoundException('AI playbook run not found.');
    return readObject(run.resultJson) as AiPlaybookResult;
  }
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
