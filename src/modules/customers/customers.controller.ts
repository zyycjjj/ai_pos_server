import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { CustomersService } from './customers.service';
import { CreateCustomerDto, ListCustomersDto, LookupCustomerDto, QuickCreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('customers')
@Controller('customers')
@UseGuards(RolesGuard)
export class PosCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('lookup')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Lookup a customer by phone for POS checkout.' })
  lookup(@Query() query: LookupCustomerDto) {
    return this.customersService.lookupByPhone(query.phone);
  }

  @Post('quick-create')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  @ApiOperation({ summary: 'Find or create a lightweight customer from POS checkout.' })
  quickCreate(@Body() dto: QuickCreateCustomerDto) {
    return this.customersService.quickCreate(dto);
  }
}

@ApiTags('admin-customers')
@Controller('admin/customers')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customers for the active store.' })
  listCustomers(@Query() query: ListCustomersDto) {
    return this.customersService.listCustomers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a customer profile.' })
  getCustomer(@Param('id') id: string) {
    return this.customersService.getCustomer(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a customer profile.' })
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.customersService.createCustomer(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer profile.' })
  updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.updateCustomer(id, dto);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'List customer order history.' })
  listOrders(@Param('id') id: string, @Query() query: ListCustomersDto) {
    return this.customersService.listCustomerOrders(id, query);
  }

  @Get(':id/points')
  @ApiOperation({ summary: 'List customer loyalty point ledger.' })
  listPoints(@Param('id') id: string, @Query() query: ListCustomersDto) {
    return this.customersService.listCustomerPoints(id, query);
  }
}
