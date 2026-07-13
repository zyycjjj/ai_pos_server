import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { AiCampaignService } from './campaign.service';
import { AiController } from './ai.controller';
import { AiJobService } from './ai-job.service';
import { AiService } from './ai.service';
import { AnalyticsContextAdapter } from './context/analytics-context.adapter';
import { CopilotContextRouter } from './context/copilot-context.router';
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
  controllers: [AiController, CopilotController],
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
    DeepSeekProvider,
    DeterministicFallbackProvider,
  ],
})
export class AiModule {}
