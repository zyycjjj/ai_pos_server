import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { CheckoutService } from './checkout.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

@ApiTags('checkout')
@Controller('checkout')
@UseGuards(RolesGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('orders')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.STAFF)
  @ApiOperation({ summary: 'List checkout orders for history screens.' })
  listOrders(@Query() query: ListOrdersDto) {
    return this.checkoutService.listOrders(query);
  }

  @Get('orders/:id')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.STAFF)
  @ApiOperation({ summary: 'Get a checkout order with line items.' })
  getOrder(@Param('id') id: string) {
    return this.checkoutService.getOrder(id);
  }

  @Post('orders')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Create an MVP checkout order from active products.' })
  createOrder(@Body() dto: CreateOrderDto) {
    return this.checkoutService.createOrder(dto);
  }

  @Patch('orders/:id/mark-paid')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Mark an order paid for the MVP fake-payment flow.' })
  markPaid(@Param('id') id: string) {
    return this.checkoutService.markPaid(id);
  }

  @Patch('orders/:id/mark-printed')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Mark a paid order receipt as printed on the POS terminal.' })
  markPrinted(@Param('id') id: string) {
    return this.checkoutService.markPrinted(id);
  }

  @Patch('orders/:id/cancel')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Cancel an open order.' })
  cancelOrder(@Param('id') id: string) {
    return this.checkoutService.cancelOrder(id);
  }
}
