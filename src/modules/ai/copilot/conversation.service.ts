import { Injectable, NotFoundException } from '@nestjs/common';
import { AiConversationStatus, AiMessageRole, Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string, userId: string) {
    const conversations = await this.prisma.aiConversation.findMany({
      where: { storeId, userId, status: AiConversationStatus.ACTIVE },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 30,
    });
    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? conversation.createdAt.toISOString(),
      lastMessage: conversation.messages[0]?.content ?? null,
      createdAt: conversation.createdAt.toISOString(),
    }));
  }

  async history(storeId: string, userId: string, conversationId: string) {
    const conversation = await this.findOwnedConversation(storeId, userId, conversationId);
    return {
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        structuredData: message.structuredData,
        periodContext: message.periodContext,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  async resolveConversation(input: { storeId: string; userId: string; conversationId?: string; firstMessage: string }) {
    if (input.conversationId) {
      return this.findOwnedConversation(input.storeId, input.userId, input.conversationId);
    }

    return this.prisma.aiConversation.create({
      data: {
        storeId: input.storeId,
        userId: input.userId,
        title: this.createTitle(input.firstMessage),
        lastMessageAt: new Date(),
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async addMessage(input: {
    conversationId: string;
    storeId: string;
    userId?: string;
    role: AiMessageRole;
    content: string;
    structuredData?: Prisma.InputJsonValue;
    periodContext?: Prisma.InputJsonValue;
  }) {
    const message = await this.prisma.aiMessage.create({
      data: {
        conversationId: input.conversationId,
        storeId: input.storeId,
        userId: input.userId,
        role: input.role,
        content: input.content,
        structuredData: input.structuredData,
        periodContext: input.periodContext,
      },
    });
    await this.prisma.aiConversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    return message;
  }

  private async findOwnedConversation(storeId: string, userId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, storeId, userId, status: AiConversationStatus.ACTIVE },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new NotFoundException('AI conversation not found.');
    }
    return conversation;
  }

  private createTitle(message: string) {
    const trimmed = message.trim().replace(/\s+/g, ' ');
    return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
  }
}

