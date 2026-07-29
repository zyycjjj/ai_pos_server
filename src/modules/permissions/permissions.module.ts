import { Global, Module } from '@nestjs/common';

import { StorePermissionPolicyService } from './store-permission-policy.service';

@Global()
@Module({
  providers: [StorePermissionPolicyService],
  exports: [StorePermissionPolicyService],
})
export class PermissionsModule {}
