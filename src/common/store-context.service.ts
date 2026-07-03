import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class StoreContextService {
  constructor(private readonly cls: ClsService) {}

  getStoreId() {
    const storeId = this.cls.get('storeId');
    if (typeof storeId !== 'string' || storeId.length === 0) {
      throw new UnauthorizedException('Store context is required.');
    }
    return storeId;
  }
}
