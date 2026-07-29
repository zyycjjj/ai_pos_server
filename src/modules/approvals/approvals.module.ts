import { Global, Module } from '@nestjs/common';

import { PermissionsModule } from '@/modules/permissions/permissions.module';

import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ManagerPinService } from './manager-pin.service';

@Global()
@Module({
  imports: [PermissionsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, ManagerPinService],
  exports: [ApprovalsService, ManagerPinService],
})
export class ApprovalsModule {}
