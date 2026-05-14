import { Injectable, NestMiddleware } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { NextFunction, Request, Response } from 'express';

type AuthUser = {
  id: string;
  role: string;
};

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'] ?? 'MERCHANT';

    if (typeof userId === 'string' && userId.length > 0) {
      this.cls.set('user', {
        id: userId,
        role: String(userRole),
      } satisfies AuthUser);
    }

    next();
  }
}
