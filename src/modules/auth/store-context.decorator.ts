import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const StoreContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return {
    storeId: request.storeId,
    role: request.user?.role,
  };
});
