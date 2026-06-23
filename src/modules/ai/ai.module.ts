import { Module } from '@nestjs/common';

import { AiCampaignService } from './campaign.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DeepSeekMenuService } from './deepseek-menu.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiCampaignService, DeepSeekMenuService],
})
export class AiModule {}
