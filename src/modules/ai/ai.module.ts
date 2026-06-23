import { Module } from '@nestjs/common';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DeepSeekMenuService } from './deepseek-menu.service';

@Module({
  controllers: [AiController],
  providers: [AiService, DeepSeekMenuService],
})
export class AiModule {}
