import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { AdminService } from './admin.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { DisableStaffDto } from './dto/disable-staff.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Read Admin dashboard metrics for the active store.' })
  getDashboard() {
    return this.adminService.getDashboard();
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
  listProducts() {
    return this.adminService.listProducts();
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List campaign drafts for the active store.' })
  listCampaigns() {
    return this.adminService.listCampaigns();
  }

  @Get('ai-drafts')
  @ApiOperation({ summary: 'List AI drafts for the active store.' })
  listAiDrafts() {
    return this.adminService.listAiDrafts();
  }
}
