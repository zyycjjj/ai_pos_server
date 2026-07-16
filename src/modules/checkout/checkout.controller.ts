import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { CheckoutService } from './checkout.service';
import { CreateOrderDto, HoldOrderDto, PayOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrderReasonDto, RefundOrderDto, VoidOrderDto } from './dto/order-action.dto';

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
  createOrder(@Body() dto: CreateOrderDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.checkoutService.createOrder(dto, currentUser);
  }

  @Post('orders/hold')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Create a held order for later resume and payment.' })
  holdOrder(@Body() dto: HoldOrderDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.checkoutService.holdOrder(dto, currentUser);
  }

  @Patch('orders/:id/resume')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Resume a held order back to open status.' })
  resumeOrder(@Param('id') id: string, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.checkoutService.resumeOrder(id, currentUser);
  }

  @Patch('orders/:id/mark-paid')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Mark an order paid for the MVP fake-payment flow.' })
  markPaid(@Param('id') id: string) {
    return this.checkoutService.markPaid(id);
  }

  @Post('orders/:id/pay')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Pay a resumed open order with validated payment lines.' })
  payOrder(@Param('id') id: string, @Body() dto: PayOrderDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.checkoutService.payOrder(id, dto, currentUser);
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
  cancelOrder(@Param('id') id: string, @Body() dto: OrderReasonDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.checkoutService.cancelOrder(id, dto, currentUser);
  }

  @Patch('orders/:id/void')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Void an order with manager approval and audit trail.' })
  voidOrder(@Param('id') id: string, @Body() dto: VoidOrderDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.checkoutService.voidOrder(id, dto, currentUser);
  }

  @Post('orders/:id/refunds')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  @ApiOperation({ summary: 'Create a full, partial, or item-level refund for an order.' })
  refundOrder(@Param('id') id: string, @Body() dto: RefundOrderDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.checkoutService.refundOrder(id, dto, currentUser);
  }
}
