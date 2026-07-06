import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: { storeId: string; isActive?: boolean; orderBy?: Prisma.ProductOrderByWithRelationInput[] }) {
    return this.prisma.product.findMany({
      where: {
        storeId: params.storeId,
        ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      },
      include: {
        modifierGroups: {
          include: {
            options: {
              where: { status: { not: 'INACTIVE' } },
              orderBy: { displayOrder: 'asc' },
            },
          },
          where: { status: 'ACTIVE' },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: params.orderBy,
    });
  }
}
