import { Injectable, NestMiddleware } from '@nestjs/common';
import type { StoreRole } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { NextFunction, Request, Response } from 'express';

import { PrismaService } from '@/prisma/prisma.service';
import { verifyAuthToken } from '@/modules/auth/jwt';

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  storeId: string;
  role: StoreRole;
};

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private readonly cls: ClsService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request & { user?: AuthUser; storeId?: string }, res: Response, next: NextFunction) {
    if (this.isPublicRoute(req)) {
      next();
      return;
    }

    const token = this.readBearerToken(req);
    if (!token) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      res.status(401).json({ message: 'Invalid or expired token.' });
      return;
    }

    const headerStoreId = req.headers['x-store-id'];
    const storeId = typeof headerStoreId === 'string' && headerStoreId.length > 0 ? headerStoreId : payload.activeStoreId;
    const membership = await this.prisma.storeUser.findFirst({
      where: {
        userId: payload.sub,
        storeId,
        active: true,
        user: { active: true },
        store: { active: true },
      },
      include: { user: true },
    });

    if (!membership) {
      res.status(403).json({ message: 'Current user cannot access this store.' });
      return;
    }

    const user: AuthUser = {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      storeId,
      role: membership.role,
    };

    req.user = user;
    req.storeId = storeId;
    this.cls.run(() => {
      this.cls.set('user', user);
      this.cls.set('storeId', storeId);
      this.cls.set('role', membership.role);
      next();
    });
  }

  private readBearerToken(req: Request) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }
    return authorization.slice('Bearer '.length).trim();
  }

  private isPublicRoute(req: Request) {
    const url = req.originalUrl ?? req.url;
    return (
      url === '/api/health' ||
      url === '/api/version' ||
      url === '/api/version.commit' ||
      url.startsWith('/api/docs') ||
      url === '/api/auth/login' ||
      url === '/api/auth/register-store'
    );
  }
}
