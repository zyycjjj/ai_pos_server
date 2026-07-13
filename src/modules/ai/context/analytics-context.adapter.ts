import { Injectable } from '@nestjs/common';

import { AnalyticsService } from '@/modules/analytics/analytics.service';

import type { CopilotContextType, CopilotPeriodInput } from '../copilot/copilot.types';
import { compactAnalyticsContext } from './context-budget.policy';

@Injectable()
export class AnalyticsContextAdapter {
  constructor(private readonly analytics: AnalyticsService) {}

  async getContext(type: CopilotContextType, period: CopilotPeriodInput = {}) {
    const context = await this.analytics.aiContext({
      preset: period.preset ?? 'last_7_days',
      from: period.from,
      to: period.to,
      compare: period.compare ?? 'previous_period',
    });

    return {
      type,
      analytics: compactAnalyticsContext(context),
    };
  }
}

