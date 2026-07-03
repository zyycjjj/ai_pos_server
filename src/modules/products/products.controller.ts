import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'List products for POS product management.' })
  listProducts(@Query() query: ListProductsDto) {
    return this.productsService.listProducts(query);
  }

  @Get('active')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.STAFF)
  @ApiOperation({ summary: 'List active products for POS checkout.' })
  listActiveProducts() {
    return this.productsService.listActiveProducts();
  }
}
