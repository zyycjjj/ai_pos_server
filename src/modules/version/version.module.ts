import { Module } from '@nestjs/common';

import { VersionCommitController, VersionController } from './version.controller';

@Module({
  controllers: [VersionController, VersionCommitController],
})
export class VersionModule {}
