import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { AiCampaignService } from './campaign.service';
import { AiController } from './ai.controller';
import { AiJobService } from './ai-job.service';
import { AiService } from './ai.service';
import { AiActionNormalizer } from './actions/ai-action-normalizer';
import { AiActionsController } from './actions/ai-actions.controller';
import { AiActionsRepository } from './actions/ai-actions.repository';
import { AiActionsService } from './actions/ai-actions.service';
import { AnalyticsContextAdapter } from './context/analytics-context.adapter';
import { CopilotContextRouter } from './context/copilot-context.router';
import { BusinessDailyController } from './business-daily/business-daily.controller';
import { BusinessDailyFallback } from './business-daily/business-daily-fallback';
import { BusinessDailyRepository } from './business-daily/business-daily.repository';
import { BusinessDailyService } from './business-daily/business-daily.service';
import { BossDashboardFallback } from './boss-dashboard/boss-dashboard-fallback';
import { BossDashboardService } from './boss-dashboard/boss-dashboard.service';
import { BusinessQueryController } from './business-query/business-query.controller';
import { BusinessQueryConversationRepository } from './business-query/business-query-conversation.repository';
import { BusinessQueryDrilldown } from './business-query/business-query-drilldown';
import { BusinessQueryFallback } from './business-query/business-query-fallback';
import { BusinessQueryHistoryRepository } from './business-query/business-query-history.repository';
import { BusinessQueryService } from './business-query/business-query.service';
import { CampaignRecommendationFallback } from './campaign-recommendation/campaign-recommendation-fallback';
import { CampaignRecommendationService } from './campaign-recommendation/campaign-recommendation.service';
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
  controllers: [AiController, CopilotController, BusinessDailyController, BusinessQueryController, AiActionsController],
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
    BossDashboardService,
    BossDashboardFallback,
    BusinessQueryService,
    BusinessQueryFallback,
    BusinessQueryConversationRepository,
    BusinessQueryDrilldown,
    BusinessQueryHistoryRepository,
    CampaignRecommendationService,
    CampaignRecommendationFallback,
    DeepSeekProvider,
    DeterministicFallbackProvider,
    AiActionsService,
    AiActionsRepository,
    AiActionNormalizer,
  ],
})
export class AiModule {}
