import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products for POS product management.' })
  listProducts(@Query() query: ListProductsDto) {
    return this.productsService.listProducts(query);
  }

  @Get('active')
  @ApiOperation({ summary: 'List active products for POS checkout.' })
  listActiveProducts() {
    return this.productsService.listActiveProducts();
  }
}

