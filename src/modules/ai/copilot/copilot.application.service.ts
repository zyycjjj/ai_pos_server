import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AiMessageRole, Prisma } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { AnalyticsContextAdapter } from '../context/analytics-context.adapter';
import { CopilotContextRouter } from '../context/copilot-context.router';
import { AiExecutionService } from '../execution/ai-execution.service';
import { parseCopilotResponse } from '../parsers/copilot-response.parser';
import { COPILOT_SYSTEM_PROMPT } from '../prompt/copilot-system-prompt';
import { buildCopilotPrompt } from '../prompt/copilot-prompt.builder';
import { DeepSeekProvider } from '../providers/deepseek.provider';
import { DeterministicFallbackProvider } from '../providers/deterministic-fallback.provider';
import { ConversationService } from './conversation.service';
import type { CopilotChatResponse, CopilotEvidence, CopilotStructuredResponse } from './copilot.types';
import { CopilotChatDto } from './dto/copilot-chat.dto';
import { createSuggestedQuestions } from './daily-brief.service';

@Injectable()
export class CopilotApplicationService {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly conversations: ConversationService,
    private readonly router: CopilotContextRouter,
    private readonly analyticsContext: AnalyticsContextAdapter,
    private readonly deepSeek: DeepSeekProvider,
    private readonly fallback: DeterministicFallbackProvider,
    private readonly executions: AiExecutionService,
  ) {}

  listConversations(user: AuthRequestUser) {
    return this.conversations.list(this.storeContext.getStoreId(), user.id);
  }

  getConversation(user: AuthRequestUser, conversationId: string) {
    return this.conversations.history(this.storeContext.getStoreId(), user.id, conversationId);
  }

  async chat(dto: CopilotChatDto, user: AuthRequestUser): Promise<CopilotChatResponse> {
    const storeId = this.storeContext.getStoreId();
    const conversation = await this.conversations.resolveConversation({
      storeId,
      userId: user.id,
      conversationId: dto.conversationId,
      firstMessage: dto.message,
    });
    await this.conversations.addMessage({
      conversationId: conversation.id,
      storeId,
      userId: user.id,
      role: AiMessageRole.USER,
      content: dto.message,
      periodContext: (dto.period ?? {}) as Prisma.InputJsonValue,
    });

    const contextType = this.router.resolve(dto.message);
    const context = await this.analyticsContext.getContext(contextType, dto.period ?? {});
    const analytics = context.analytics as Record<string, any>;
    const contextHash = this.hashContext(analytics);
    const history = conversation.messages.map((message) => ({ role: message.role, content: message.content }));
    const prompt = buildCopilotPrompt({ question: dto.message, contextType, analyticsContext: analytics, history });
    const execution = await this.executions.createRunning({
      storeId,
      conversationId: conversation.id,
      provider: process.env.DEEPSEEK_API_KEY?.trim() ? 'deepseek' : 'fallback',
      model: process.env.DEEPSEEK_MODEL ?? 'deterministic-fallback',
      contextType,
      contextHash,
    });

    // Evidence is rebuilt from backend analytics after parsing so an LLM cannot smuggle unsupported numbers into the response.
    const evidence = buildBackendEvidence(analytics);
    let structured: CopilotStructuredResponse;
    let provider = 'fallback';
    let model = 'deterministic-fallback';
    let source: 'deepseek' | 'fallback' = 'fallback';
    let latencyMs: number | undefined;
    let inputTokenCount: number | undefined;
    let outputTokenCount: number | undefined;
    let errorMessage: string | undefined;

    try {
      const response = await this.deepSeek.generateStructuredResponse({
        systemPrompt: COPILOT_SYSTEM_PROMPT,
        userPrompt: prompt,
      });
      if (!response) {
        throw new Error('DeepSeek API key is not configured.');
      }
      const parsed = parseCopilotResponse(response.content);
      structured = { ...parsed, evidence };
      provider = response.provider;
      model = response.model;
      source = 'deepseek';
      latencyMs = response.latencyMs;
      inputTokenCount = response.inputTokenCount;
      outputTokenCount = response.outputTokenCount;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'AI provider failed.';
      structured = this.fallback.generate({ context: analytics, reason: errorMessage });
    }

    const assistant = await this.conversations.addMessage({
      conversationId: conversation.id,
      storeId,
      role: AiMessageRole.ASSISTANT,
      content: structured.answer,
      structuredData: structured as unknown as Prisma.InputJsonValue,
      periodContext: {
        period: analytics.period,
        comparisonPeriod: analytics.comparisonPeriod,
        contextType,
      } as Prisma.InputJsonValue,
    });

    await this.executions.complete({
      id: execution.id,
      status: source === 'deepseek' ? 'SUCCEEDED' : 'FALLBACK',
      messageId: assistant.id,
      latencyMs,
      inputTokenCount,
      outputTokenCount,
      errorCode: errorMessage ? 'PROVIDER_FALLBACK' : undefined,
      errorMessage,
    });

    return {
      conversationId: conversation.id,
      messageId: assistant.id,
      executionId: execution.id,
      provider,
      model,
      source,
      contextType,
      period: analytics.period,
      comparisonPeriod: analytics.comparisonPeriod,
      dataCoverage: analytics.coverage ?? {},
      suggestedQuestions: createSuggestedQuestions(),
      ...structured,
    };
  }

  private hashContext(context: unknown) {
    return createHash('sha256').update(JSON.stringify(context)).digest('hex');
  }
}

function buildBackendEvidence(context: Record<string, any>): CopilotEvidence[] {
  const overview = context.overview ?? {};
  const comparison = context.comparison ?? {};
  const refunds = context.refunds ?? {};
  const customers = context.customers ?? {};
  const kitchen = Array.isArray(context.kitchen) ? context.kitchen[0] : undefined;
  const topProduct = Array.isArray(context.topProducts) ? context.topProducts[0] : undefined;
  const evidence: Array<CopilotEvidence | null> = [
    { label: 'Net sales', value: numberOrNull(overview.netSales), changePercent: numberOrNull(comparison.netSalesChangePercent) },
    { label: 'Orders', value: numberOrNull(overview.orderCount), changePercent: numberOrNull(comparison.orderCountChangePercent) },
    { label: 'Average ticket', value: numberOrNull(overview.averageTicket), changePercent: numberOrNull(comparison.averageTicketChangePercent) },
    { label: 'Refund rate', value: numberOrNull(refunds.refundRate) },
    { label: 'New customers', value: numberOrNull(customers.newCustomers) },
    { label: 'Repeat purchase rate', value: numberOrNull(customers.repeatPurchaseRate) },
    topProduct ? { label: `Top product: ${topProduct.name}`, value: numberOrNull(topProduct.netSales), changePercent: numberOrNull(topProduct.changePercent) } : null,
    kitchen ? { label: `Kitchen: ${kitchen.stationName}`, value: numberOrNull(kitchen.avgPrepTimeMinutes) } : null,
  ];
  return evidence.filter((item): item is CopilotEvidence => item !== null);
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
