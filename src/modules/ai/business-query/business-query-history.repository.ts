import { Injectable } from '@nestjs/common';
import { AiMessageRole, Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import type { BusinessQueryHistoryItem, BusinessQueryResponse } from './business-query.types';

@Injectable()
export class BusinessQueryHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: { storeId: string; userId: string; response: BusinessQueryResponse }) {
    const conversation = await this.prisma.aiConversation.create({
      data: {
        storeId: input.storeId,
        userId: input.userId,
        title: input.response.question.slice(0, 80),
        lastMessageAt: new Date(),
      },
    });
    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        storeId: input.storeId,
        userId: input.userId,
        role: AiMessageRole.USER,
        content: input.response.question,
        periodContext: input.response.range as unknown as Prisma.InputJsonValue,
      },
    });
    const assistant = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        storeId: input.storeId,
        userId: input.userId,
        role: AiMessageRole.ASSISTANT,
        content: input.response.answer.headline,
        structuredData: {
          kind: 'ai_business_query',
          question: input.response.question,
          intent: input.response.intent,
          headline: input.response.answer.headline,
          fallback: input.response.fallback,
          evidenceSnapshot: input.response.evidence.slice(0, 10) as unknown as Prisma.InputJsonValue,
        } satisfies Prisma.InputJsonObject,
        periodContext: input.response.range as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.aiConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: assistant.createdAt } });
  }

  async list(storeId: string, userId: string): Promise<{ items: BusinessQueryHistoryItem[] }> {
    const messages = await this.prisma.aiMessage.findMany({
      where: { storeId, userId, role: AiMessageRole.ASSISTANT },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const items = messages
      .map((message) => {
        const structured = message.structuredData as Partial<{ kind: string; question: string; intent: BusinessQueryHistoryItem['intent']; headline: string }> | null;
        if (structured?.kind !== 'ai_business_query' || !structured.question || !structured.intent || !structured.headline) return null;
        return {
          id: message.id,
          question: structured.question,
          intent: structured.intent,
          headline: structured.headline,
          createdAt: message.createdAt.toISOString(),
        };
      })
      .filter((item): item is BusinessQueryHistoryItem => item !== null)
      .slice(0, 20);
    return { items };
  }
}
