import { Injectable } from '@nestjs/common';

import { AnalyticsContextAdapter } from '../context/analytics-context.adapter';
import { DeterministicFallbackProvider } from '../providers/deterministic-fallback.provider';

@Injectable()
export class DailyBriefService {
  constructor(
    private readonly analyticsContext: AnalyticsContextAdapter,
    private readonly fallback: DeterministicFallbackProvider,
  ) {}

  async brief() {
    const context = await this.analyticsContext.getContext('GENERAL', { preset: 'yesterday', compare: 'previous_period' });
    const structured = this.fallback.generate({
      context: context.analytics as Record<string, any>,
      reason: 'daily brief uses deterministic metrics in MVP',
    });
    return {
      ...structured,
      conversationId: '',
      messageId: '',
      executionId: '',
      provider: 'fallback',
      model: 'deterministic-fallback',
      source: 'fallback' as const,
      contextType: 'GENERAL' as const,
      period: context.analytics.period,
      comparisonPeriod: context.analytics.comparisonPeriod,
      dataCoverage: context.analytics.coverage,
      suggestedQuestions: createSuggestedQuestions(),
    };
  }
}

export function createSuggestedQuestions() {
  return [
    'How is my business doing today?',
    'Why were sales down yesterday?',
    'Which products are underperforming?',
    'What are my peak hours?',
    'Why are refunds increasing?',
    'Which kitchen station is slowest?',
    'How are repeat customers trending?',
  ];
}
