import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KitchenPrintMode, StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { KitchenService } from '@/modules/kitchen/kitchen.service';
import { ShiftsService } from '@/modules/shifts/shifts.service';

import { AdminService } from './admin.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { DisableStaffDto } from './dto/disable-staff.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';
import { UpdateCampaignStatusDto, UpsertCampaignDto } from './dto/campaign.dto';
import {
  ListAdminProductsDto,
  UpdateCatalogStatusDto,
  UpdateModifierOptionStatusDto,
  UpdateProductAvailabilityDto,
  UpdateProductStatusDto,
  UpsertCategoryDto,
  UpsertModifierGroupDto,
  UpsertModifierOptionDto,
  UpsertProductDto,
} from './dto/catalog.dto';
import {
  AssignKitchenStaffStationsDto,
  CancelKitchenTicketDto,
  ListKitchenTicketHistoryDto,
  ListKitchenTicketsDto,
  UpdateKitchenStationStatusDto,
  UpdateKitchenPrintModeDto,
  UpdateKitchenTicketPriorityDto,
  UpsertKitchenStationDto,
} from '../kitchen/dto/kitchen.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly shiftsService: ShiftsService,
    private readonly kitchenService: KitchenService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Read Admin dashboard metrics for the active store.' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('shifts')
  @ApiOperation({ summary: 'List shift history for Admin management.' })
  listShifts() {
    return this.shiftsService.listShifts();
  }

  @Get('shifts/:id')
  @ApiOperation({ summary: 'Read shift detail for Admin management.' })
  getShift(@Param('id') id: string) {
    return this.shiftsService.getShift(id);
  }

  @Get('kitchen/stations')
  @ApiOperation({ summary: 'List kitchen stations for Admin management.' })
  listKitchenStations() {
    return this.kitchenService.listStations();
  }

  @Get('kitchen/settings')
  @ApiOperation({ summary: 'Read Admin kitchen configuration settings.' })
  getKitchenSettings() {
    return this.kitchenService.getSettings();
  }

  @Patch('kitchen/settings/print-mode')
  @ApiOperation({ summary: 'Configure kitchen ticket print mode.' })
  updateKitchenPrintMode(@Body() dto: UpdateKitchenPrintModeDto) {
    return this.kitchenService.updatePrintMode(dto.mode as KitchenPrintMode);
  }

  @Post('kitchen/stations')
  @ApiOperation({ summary: 'Create a kitchen station from Admin management.' })
  createKitchenStation(@Body() dto: UpsertKitchenStationDto) {
    return this.kitchenService.createStation(dto);
  }

  @Patch('kitchen/stations/:id')
  @ApiOperation({ summary: 'Update a kitchen station from Admin management.' })
  updateKitchenStation(@Param('id') id: string, @Body() dto: UpsertKitchenStationDto) {
    return this.kitchenService.updateStation(id, dto);
  }

  @Patch('kitchen/stations/:id/status')
  @ApiOperation({ summary: 'Enable or disable a kitchen station from Admin management.' })
  updateKitchenStationStatus(@Param('id') id: string, @Body() dto: UpdateKitchenStationStatusDto) {
    return this.kitchenService.updateStationStatus(id, dto.status);
  }

  @Patch('kitchen/stations/:id/default')
  @ApiOperation({ summary: 'Set default kitchen station from Admin management.' })
  setDefaultKitchenStation(@Param('id') id: string) {
    return this.kitchenService.setDefaultStation(id);
  }

  @Get('kitchen/tickets')
  @ApiOperation({ summary: 'List kitchen tickets for Admin management.' })
  listKitchenTickets(@Query() query: ListKitchenTicketsDto) {
    return this.kitchenService.listTickets(query);
  }

  @Get('kitchen/tickets/history')
  @ApiOperation({ summary: 'List kitchen ticket history for Admin management.' })
  listKitchenTicketHistory(@Query() query: ListKitchenTicketHistoryDto) {
    return this.kitchenService.listTicketHistory(query);
  }

  @Get('kitchen/tickets/:id')
  @ApiOperation({ summary: 'Read kitchen ticket detail for Admin management.' })
  getKitchenTicket(@Param('id') id: string) {
    return this.kitchenService.getTicket(id);
  }

  @Get('kitchen/tickets/:id/preview')
  @ApiOperation({ summary: 'Preview kitchen ticket content from Admin management.' })
  previewKitchenTicket(@Param('id') id: string) {
    return this.kitchenService.previewTicket(id);
  }

  @Post('kitchen/tickets/:id/start')
  @ApiOperation({ summary: 'Start a kitchen ticket from Admin management.' })
  startKitchenTicket(@Param('id') id: string) {
    return this.kitchenService.startTicket(id);
  }

  @Post('kitchen/tickets/:id/ready')
  @ApiOperation({ summary: 'Mark a kitchen ticket ready from Admin management.' })
  markKitchenTicketReady(@Param('id') id: string) {
    return this.kitchenService.markReady(id);
  }

  @Post('kitchen/tickets/:id/complete')
  @ApiOperation({ summary: 'Complete a kitchen ticket from Admin management.' })
  completeKitchenTicket(@Param('id') id: string) {
    return this.kitchenService.completeTicket(id);
  }

  @Post('kitchen/tickets/:id/cancel')
  @ApiOperation({ summary: 'Cancel a kitchen ticket from Admin management.' })
  cancelKitchenTicket(@Param('id') id: string, @Body() dto: CancelKitchenTicketDto) {
    return this.kitchenService.cancelTicket(id, dto);
  }

  @Post('kitchen/tickets/:id/rush')
  @ApiOperation({ summary: 'Mark a kitchen ticket urgent from Admin management.' })
  rushKitchenTicket(@Param('id') id: string, @Body() dto: UpdateKitchenTicketPriorityDto) {
    return this.kitchenService.rushTicket(id, dto);
  }

  @Post('kitchen/tickets/:id/unrush')
  @ApiOperation({ summary: 'Remove urgent priority from a kitchen ticket from Admin management.' })
  unrushKitchenTicket(@Param('id') id: string, @Body() dto: UpdateKitchenTicketPriorityDto) {
    return this.kitchenService.unrushTicket(id, dto);
  }

  @Get('kitchen/route-summary')
  @ApiOperation({ summary: 'Read kitchen route completeness summary.' })
  getKitchenRouteSummary() {
    return this.kitchenService.getRouteSummary();
  }

  @Get('kitchen/staff-stations')
  @ApiOperation({ summary: 'List kitchen staff station assignments.' })
  listKitchenStaffStations() {
    return this.kitchenService.listKitchenStaffStations();
  }

  @Patch('kitchen/staff-stations')
  @ApiOperation({ summary: 'Assign kitchen stations to a kitchen staff user.' })
  assignKitchenStaffStations(@Body() dto: AssignKitchenStaffStationsDto) {
    return this.kitchenService.assignKitchenStaffStations(dto);
  }

  @Get('staff')
  @ApiOperation({ summary: 'List staff for the active store.' })
  listStaff() {
    return this.adminService.listStaff();
  }

  @Post('staff')
  @ApiOperation({ summary: 'Create a staff user in the active store.' })
  createStaff(@Body() dto: CreateStaffDto) {
    return this.adminService.createStaff(dto);
  }

  @Patch('staff/:id/role')
  @ApiOperation({ summary: 'Change a staff role in the active store.' })
  updateStaffRole(@Param('id') id: string, @Body() dto: UpdateStaffRoleDto) {
    return this.adminService.updateStaffRole(id, dto);
  }

  @Patch('staff/:id/disable')
  @ApiOperation({ summary: 'Enable or disable a staff member in the active store.' })
  disableStaff(@Param('id') id: string, @Body() dto: DisableStaffDto) {
    return this.adminService.disableStaff(id, dto);
  }

  @Get('products')
  @ApiOperation({ summary: 'List products for Admin management.' })
  listProducts(@Query() query: ListAdminProductsDto) {
    return this.adminService.listProducts(query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Read a product detail for Admin editing.' })
  getProduct(@Param('id') id: string) {
    return this.adminService.getProduct(id);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a product in the active store.' })
  createProduct(@Body() dto: UpsertProductDto) {
    return this.adminService.createProduct(dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update product basic information.' })
  updateProduct(@Param('id') id: string, @Body() dto: UpsertProductDto) {
    return this.adminService.updateProduct(id, dto);
  }

  @Patch('products/:id/status')
  @ApiOperation({ summary: 'Enable or disable a product.' })
  updateProductStatus(@Param('id') id: string, @Body() dto: UpdateProductStatusDto) {
    return this.adminService.updateProductStatus(id, dto);
  }

  @Patch('products/:id/availability')
  @ApiOperation({ summary: 'Mark a product available or sold out.' })
  updateProductAvailability(@Param('id') id: string, @Body() dto: UpdateProductAvailabilityDto) {
    return this.adminService.updateProductAvailability(id, dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List product categories for the active store.' })
  listCategories() {
    return this.adminService.listCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a product category.' })
  createCategory(@Body() dto: UpsertCategoryDto) {
    return this.adminService.createCategory(dto);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Rename or reorder a product category.' })
  updateCategory(@Param('id') id: string, @Body() dto: UpsertCategoryDto) {
    return this.adminService.updateCategory(id, dto);
  }

  @Patch('categories/:id/status')
  @ApiOperation({ summary: 'Enable or disable a category.' })
  updateCategoryStatus(@Param('id') id: string, @Body() dto: UpdateCatalogStatusDto) {
    return this.adminService.updateCategoryStatus(id, dto);
  }

  @Post('products/:productId/modifier-groups')
  @ApiOperation({ summary: 'Create a modifier group for a product.' })
  createModifierGroup(@Param('productId') productId: string, @Body() dto: UpsertModifierGroupDto) {
    return this.adminService.createModifierGroup(productId, dto);
  }

  @Patch('modifier-groups/:groupId')
  @ApiOperation({ summary: 'Update a modifier group.' })
  updateModifierGroup(@Param('groupId') groupId: string, @Body() dto: UpsertModifierGroupDto) {
    return this.adminService.updateModifierGroup(groupId, dto);
  }

  @Patch('modifier-groups/:groupId/status')
  @ApiOperation({ summary: 'Enable or disable a modifier group.' })
  updateModifierGroupStatus(@Param('groupId') groupId: string, @Body() dto: UpdateCatalogStatusDto) {
    return this.adminService.updateModifierGroupStatus(groupId, dto);
  }

  @Post('modifier-groups/:groupId/options')
  @ApiOperation({ summary: 'Create a modifier option.' })
  createModifierOption(@Param('groupId') groupId: string, @Body() dto: UpsertModifierOptionDto) {
    return this.adminService.createModifierOption(groupId, dto);
  }

  @Patch('modifier-options/:optionId')
  @ApiOperation({ summary: 'Update a modifier option.' })
  updateModifierOption(@Param('optionId') optionId: string, @Body() dto: UpsertModifierOptionDto) {
    return this.adminService.updateModifierOption(optionId, dto);
  }

  @Patch('modifier-options/:optionId/status')
  @ApiOperation({ summary: 'Update modifier option status.' })
  updateModifierOptionStatus(@Param('optionId') optionId: string, @Body() dto: UpdateModifierOptionStatusDto) {
    return this.adminService.updateModifierOptionStatus(optionId, dto);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List campaign drafts for the active store.' })
  listCampaigns() {
    return this.adminService.listCampaigns();
  }

  @Post('campaigns')
  @ApiOperation({ summary: 'Create a promotion campaign.' })
  createCampaign(@Body() dto: UpsertCampaignDto) {
    return this.adminService.createCampaign(dto);
  }

  @Patch('campaigns/:id')
  @ApiOperation({ summary: 'Update a promotion campaign.' })
  updateCampaign(@Param('id') id: string, @Body() dto: UpsertCampaignDto) {
    return this.adminService.updateCampaign(id, dto);
  }

  @Patch('campaigns/:id/status')
  @ApiOperation({ summary: 'Update campaign status.' })
  updateCampaignStatus(@Param('id') id: string, @Body() dto: UpdateCampaignStatusDto) {
    return this.adminService.updateCampaignStatus(id, dto);
  }

  @Get('ai-drafts')
  @ApiOperation({ summary: 'List AI drafts for the active store.' })
  listAiDrafts() {
    return this.adminService.listAiDrafts();
  }
}
