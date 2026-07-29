import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { AiCampaignService } from './campaign.service';
import { AiController } from './ai.controller';
import { AiJobService } from './ai-job.service';
import { AiService } from './ai.service';
import { AnalyticsContextAdapter } from './context/analytics-context.adapter';
import { CopilotContextRouter } from './context/copilot-context.router';
import { BusinessDailyController } from './business-daily/business-daily.controller';
import { BusinessDailyFallback } from './business-daily/business-daily-fallback';
import { BusinessDailyRepository } from './business-daily/business-daily.repository';
import { BusinessDailyService } from './business-daily/business-daily.service';
import { CopilotApplicationService } from './copilot/copilot.application.service';
import { CopilotController } from './copilot/copilot.controller';
import { ConversationService } from './copilot/conversation.service';
import { DailyBriefService } from './copilot/daily-brief.service';
import { DeepSeekMenuService } from './deepseek-menu.service';
import { AiExecutionService } from './execution/ai-execution.service';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { DeterministicFallbackProvider } from './providers/deterministic-fallback.provider';

@Module({
  imports: [AnalyticsModule],
  controllers: [AiController, CopilotController, BusinessDailyController],
  providers: [
    AiService,
    AiCampaignService,
    AiJobService,
    DeepSeekMenuService,
    CopilotApplicationService,
    ConversationService,
    DailyBriefService,
    AnalyticsContextAdapter,
    CopilotContextRouter,
    AiExecutionService,
    BusinessDailyService,
    BusinessDailyRepository,
    BusinessDailyFallback,
    DeepSeekProvider,
    DeterministicFallbackProvider,
  ],
})
export class AiModule {}
