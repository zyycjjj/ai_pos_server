import { Injectable, NestMiddleware } from '@nestjs/common';
import { RPCApiHandler } from '@zenstackhq/server/api/rpc';
import { ZenStackMiddleware } from '@zenstackhq/server/express';
import { enhance } from '@zenstackhq/runtime';
import type { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class RpcMiddleware implements NestMiddleware {
  constructor(
    private readonly cls: ClsService,
    private readonly prisma: PrismaService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const user = this.cls.get('user');
    const inner = ZenStackMiddleware({
      getPrisma: () => enhance(this.prisma, { user }),
      handler: RPCApiHandler(),
    });

    inner(req, res, next);
  }
}
