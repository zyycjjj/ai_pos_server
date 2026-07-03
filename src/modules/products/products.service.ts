import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';

import { ListProductsDto } from './dto/list-products.dto';
import { presentProduct } from './presenter/product.presenter';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly storeContext?: StoreContextService,
  ) {}

  async listProducts(query: ListProductsDto) {
    const products = await this.productsRepository.findMany({
      storeId: this.getStoreId(),
      isActive: query.active === undefined ? undefined : query.active === 'true',
      orderBy: this.createOrderBy(query.orderBy),
    });

    return products.map(presentProduct);
  }

  async listActiveProducts() {
    const products = await this.productsRepository.findMany({
      storeId: this.getStoreId(),
      isActive: true,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return products.map(presentProduct);
  }

  private createOrderBy(orderBy: ListProductsDto['orderBy']): Prisma.ProductOrderByWithRelationInput[] {
    if (orderBy === 'createdAt') {
      return [{ createdAt: 'desc' }];
    }

    if (orderBy === 'name') {
      return [{ name: 'asc' }];
    }

    return [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }];
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
