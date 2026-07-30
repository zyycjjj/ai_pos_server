import { Injectable, NotFoundException } from '@nestjs/common';
import { AiMessageRole, Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import type {
  BusinessQueryConversationDetail,
  BusinessQueryConversationSummary,
  BusinessQueryHistoryItem,
  BusinessQueryResponse,
} from './business-query.types';

type LastBusinessQueryContext = {
  conversationId: string;
  title: string;
  previousIntent: BusinessQueryResponse['intent'] | null;
  previousRange: BusinessQueryResponse['range'] | null;
  previousAnswerHeadline: string | null;
  previousEvidence: BusinessQueryResponse['evidence'];
  previousSuggestedActions: BusinessQueryResponse['suggestedActions'];
};

@Injectable()
export class BusinessQueryConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(storeId: string, conversationId?: string | null): Promise<LastBusinessQueryContext | null> {
    if (!conversationId) return null;
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, storeId } });
    if (!conversation) throw new NotFoundException('AI conversation not found.');
    const assistant = await this.prisma.aiMessage.findFirst({
      where: { conversationId, storeId, role: AiMessageRole.ASSISTANT },
      orderBy: { createdAt: 'desc' },
    });
    const structured = readStructured(assistant?.structuredData);
    return {
      conversationId,
      title: conversation.title,
      previousIntent: structured?.intent ?? null,
      previousRange: structured?.range ?? null,
      previousAnswerHeadline: structured?.answer?.headline ?? structured?.headline ?? null,
      previousEvidence: structured?.evidenceSnapshot ?? [],
      previousSuggestedActions: structured?.suggestedActions ?? [],
    };
  }

  async record(input: { storeId: string; userId: string; conversationId?: string | null; response: BusinessQueryResponse }) {
    const conversation = input.conversationId
      ? await this.prisma.aiConversation.findFirst({ where: { id: input.conversationId, storeId: input.storeId } })
      : null;
    if (input.conversationId && !conversation) throw new NotFoundException('AI conversation not found.');
    const target = conversation ?? await this.prisma.aiConversation.create({
      data: {
        storeId: input.storeId,
        userId: input.userId,
        title: input.response.question.slice(0, 80),
        lastMessageAt: new Date(),
      },
    });

    await this.prisma.aiMessage.create({
      data: {
        conversationId: target.id,
        storeId: input.storeId,
        userId: input.userId,
        role: AiMessageRole.USER,
        content: input.response.question,
        periodContext: input.response.range as unknown as Prisma.InputJsonValue,
      },
    });
    const assistant = await this.prisma.aiMessage.create({
      data: {
        conversationId: target.id,
        storeId: input.storeId,
        userId: input.userId,
        role: AiMessageRole.ASSISTANT,
        content: input.response.answer.headline,
        structuredData: {
          kind: 'ai_business_query',
          question: input.response.question,
          intent: input.response.intent,
          resolvedIntent: input.response.resolvedIntent,
          headline: input.response.answer.headline,
          answer: input.response.answer as unknown as Prisma.InputJsonValue,
          range: input.response.range as unknown as Prisma.InputJsonValue,
          fallback: input.response.fallback,
          evidenceSnapshot: input.response.evidence.slice(0, 24) as unknown as Prisma.InputJsonValue,
          suggestedActions: input.response.suggestedActions as unknown as Prisma.InputJsonValue,
          contextUsed: input.response.contextUsed as unknown as Prisma.InputJsonValue,
          isFollowUp: input.response.isFollowUp,
        } satisfies Prisma.InputJsonObject,
        periodContext: input.response.range as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.aiConversation.update({ where: { id: target.id }, data: { lastMessageAt: assistant.createdAt } });
    return { conversationId: target.id, messageId: assistant.id };
  }

  async listConversations(storeId: string): Promise<{ items: BusinessQueryConversationSummary[] }> {
    const conversations = await this.prisma.aiConversation.findMany({
      where: { storeId },
      include: { messages: { where: { role: AiMessageRole.ASSISTANT }, orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    return {
      items: conversations
        .map((conversation) => {
          const structured = readStructured(conversation.messages[0]?.structuredData);
          if (!structured) return null;
          return {
            id: conversation.id,
            title: conversation.title,
            lastIntent: structured.intent ?? null,
            lastAnswerHeadline: structured.answer?.headline ?? structured.headline ?? null,
            updatedAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
          };
        })
        .filter((item): item is BusinessQueryConversationSummary => item !== null),
    };
  }

  async getConversation(storeId: string, id: string): Promise<BusinessQueryConversationDetail> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, storeId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('AI conversation not found.');
    return {
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages.map((message) => {
        const structured = readStructured(message.structuredData);
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          question: structured?.question,
          answer: structured?.answer,
          intent: structured?.intent,
          resolvedIntent: structured?.resolvedIntent,
          range: structured?.range,
          evidence: structured?.evidenceSnapshot ?? [],
          suggestedActions: structured?.suggestedActions ?? [],
          fallback: structured?.fallback,
          contextUsed: structured?.contextUsed,
          createdAt: message.createdAt.toISOString(),
        };
      }),
    };
  }

  async listHistory(storeId: string, userId: string): Promise<{ items: BusinessQueryHistoryItem[] }> {
    const conversations = await this.listConversations(storeId);
    return {
      items: conversations.items.slice(0, 20).map((item) => ({
        id: item.id,
        conversationId: item.id,
        question: item.title,
        intent: item.lastIntent ?? 'GENERAL_BUSINESS_SUMMARY',
        headline: item.lastAnswerHeadline ?? item.title,
        createdAt: item.updatedAt,
      })),
    };
  }
}

function readStructured(value: unknown): (Partial<BusinessQueryResponse> & { kind?: string; headline?: string; evidenceSnapshot?: BusinessQueryResponse['evidence'] }) | null {
  if (!value || typeof value !== 'object') return null;
  const structured = value as Partial<BusinessQueryResponse> & { kind?: string; headline?: string; evidenceSnapshot?: BusinessQueryResponse['evidence'] };
  return structured.kind === 'ai_business_query' ? structured : null;
}
