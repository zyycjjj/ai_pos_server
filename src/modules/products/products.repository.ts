import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: { isActive?: boolean; orderBy?: Prisma.ProductOrderByWithRelationInput[] }) {
    return this.prisma.product.findMany({
      where: params.isActive === undefined ? undefined : { isActive: params.isActive },
      include: {
        modifierGroups: {
          include: {
            options: {
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: params.orderBy,
    });
  }
}
