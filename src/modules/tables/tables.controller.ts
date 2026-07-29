import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { TablesService } from './tables.service';
import { AddTableItemsDto, BatchCreateDiningTablesDto, CancelTableOrderDto, CheckoutTableDto, DeleteTableOrderItemDto, MergeTableDto, OpenTableDto, SplitBillDto, TransferTableDto, UpdateTableOrderItemDto, UpsertDiningAreaDto, UpsertDiningTableDto } from './dto/table.dto';

@ApiTags('tables')
@Controller()
@UseGuards(RolesGuard)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('tables')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER, StoreRole.STAFF)
  @ApiOperation({ summary: 'List POS dining tables with current order state.' })
  listTables() {
    return this.tablesService.listTables();
  }

  @Post('tables/:id/open')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  openTable(@Param('id') id: string, @Body() dto: OpenTableDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.tablesService.openTable(id, dto, currentUser);
  }

  @Post('tables/:id/items')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  addItems(@Param('id') id: string, @Body() dto: AddTableItemsDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.tablesService.addItems(id, dto, currentUser);
  }

  @Patch('tables/:id/items/:itemId')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  updateOrderItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateTableOrderItemDto) {
    return this.tablesService.updateOrderItem(id, itemId, dto);
  }

  @Post('tables/:id/items/:itemId/delete')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  deleteOrderItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: DeleteTableOrderItemDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.tablesService.deleteOrderItem(id, itemId, dto, currentUser);
  }

  @Post('tables/:id/checkout')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  checkout(@Param('id') id: string, @Body() dto: CheckoutTableDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.tablesService.checkout(id, dto, currentUser);
  }

  @Post('tables/:id/transfer')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  transferTable(@Param('id') id: string, @Body() dto: TransferTableDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.tablesService.transferTable(id, dto, currentUser);
  }

  @Post('tables/:id/merge')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  mergeTable(@Param('id') id: string, @Body() dto: MergeTableDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.tablesService.mergeTable(id, dto, currentUser);
  }

  @Post('tables/:id/split')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  splitBill(@Param('id') id: string, @Body() dto: SplitBillDto, @CurrentUser() currentUser?: AuthRequestUser) {
    return this.tablesService.splitBill(id, dto, currentUser);
  }

  @Post('tables/:id/clear')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  clearTable(@Param('id') id: string) {
    return this.tablesService.clearTable(id);
  }

  @Post('tables/:id/cancel')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER, StoreRole.CASHIER)
  cancelTableOrder(@Param('id') id: string, @Body() dto: CancelTableOrderDto) {
    return this.tablesService.cancelOpenOrder(id, dto);
  }

  @Get('admin/dining-areas')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  listAreas() {
    return this.tablesService.listAreas();
  }

  @Post('admin/dining-areas')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  createArea(@Body() dto: UpsertDiningAreaDto) {
    return this.tablesService.createArea(dto);
  }

  @Patch('admin/dining-areas/:id')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  updateArea(@Param('id') id: string, @Body() dto: UpsertDiningAreaDto) {
    return this.tablesService.updateArea(id, dto);
  }

  @Get('admin/dining-tables')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  listAdminTables() {
    return this.tablesService.listTables();
  }

  @Post('admin/dining-tables')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  createTable(@Body() dto: UpsertDiningTableDto) {
    return this.tablesService.createTable(dto);
  }

  @Post('admin/tables/batch-create')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  batchCreateTables(@Body() dto: BatchCreateDiningTablesDto) {
    return this.tablesService.batchCreateTables(dto);
  }

  @Patch('admin/dining-tables/:id')
  @Roles(StoreRole.OWNER, StoreRole.MANAGER)
  updateTable(@Param('id') id: string, @Body() dto: UpsertDiningTableDto) {
    return this.tablesService.updateTable(id, dto);
  }
}
