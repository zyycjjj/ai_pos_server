import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

type CompleteExecutionStatus = 'SUCCEEDED' | 'FALLBACK' | 'FAILED';

@Injectable()
export class AiExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  createRunning(input: { storeId: string; conversationId: string; provider: string; model: string; contextType: string; contextHash: string }) {
    return this.prisma.aiExecution.create({
      data: {
        storeId: input.storeId,
        conversationId: input.conversationId,
        provider: input.provider,
        model: input.model,
        status: 'RUNNING',
        contextType: input.contextType,
        contextHash: input.contextHash,
      },
    });
  }

  complete(input: {
    id: string;
    status: CompleteExecutionStatus;
    messageId?: string;
    latencyMs?: number;
    inputTokenCount?: number;
    outputTokenCount?: number;
    errorCode?: string;
    errorMessage?: string;
  }) {
    return this.prisma.aiExecution.update({
      where: { id: input.id },
      data: {
        status: input.status,
        messageId: input.messageId,
        latencyMs: input.latencyMs,
        inputTokenCount: input.inputTokenCount,
        outputTokenCount: input.outputTokenCount,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
      },
    });
  }
}
