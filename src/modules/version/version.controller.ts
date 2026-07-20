import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('version')
@Controller('version')
export class VersionController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getVersion() {
    // Version metadata comes from deployment env so source code never hardcodes a commit that can drift from the running release.
    return {
      service: 'ai-pos-server',
      version: this.read('AI_POS_VERSION'),
      commit: this.read('AI_POS_COMMIT'),
      buildTime: this.read('AI_POS_BUILD_TIME'),
      environment: this.config.get<string>('NODE_ENV') || 'unknown',
    };
  }

  private read(key: string) {
    return this.config.get<string>(key)?.trim() || 'unknown';
  }
}
