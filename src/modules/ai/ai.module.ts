import { Module } from '@nestjs/common';

import { AiCampaignService } from './campaign.service';
import { AiController } from './ai.controller';
import { AiJobService } from './ai-job.service';
import { AiService } from './ai.service';
import { DeepSeekMenuService } from './deepseek-menu.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiCampaignService, AiJobService, DeepSeekMenuService],
})
export class AiModule {}
