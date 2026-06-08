import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CheckoutService } from './checkout.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('orders')
  @ApiOperation({ summary: 'List checkout orders for history screens.' })
  listOrders(@Query() query: ListOrdersDto) {
    return this.checkoutService.listOrders(query);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get a checkout order with line items.' })
  getOrder(@Param('id') id: string) {
    return this.checkoutService.getOrder(id);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create an MVP checkout order from active products.' })
  createOrder(@Body() dto: CreateOrderDto) {
    return this.checkoutService.createOrder(dto);
  }

  @Patch('orders/:id/mark-paid')
  @ApiOperation({ summary: 'Mark an order paid for the MVP fake-payment flow.' })
  markPaid(@Param('id') id: string) {
    return this.checkoutService.markPaid(id);
  }

  @Patch('orders/:id/mark-printed')
  @ApiOperation({ summary: 'Mark a paid order receipt as printed on the POS terminal.' })
  markPrinted(@Param('id') id: string) {
    return this.checkoutService.markPrinted(id);
  }

  @Patch('orders/:id/cancel')
  @ApiOperation({ summary: 'Cancel an open order.' })
  cancelOrder(@Param('id') id: string) {
    return this.checkoutService.cancelOrder(id);
  }
}
