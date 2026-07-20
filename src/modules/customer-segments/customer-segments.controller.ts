import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerSegmentStatus, StoreRole } from '@prisma/client';

import { Roles } from '@/modules/auth/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';

import { CustomerSegmentsService } from './customer-segments.service';
import { UpdateCustomerSegmentStatusDto, UpsertCustomerSegmentDto } from './dto/customer-segment.dto';

@ApiTags('admin-customer-segments')
@Controller('admin/customer-segments')
@UseGuards(RolesGuard)
@Roles(StoreRole.OWNER, StoreRole.MANAGER)
export class CustomerSegmentsController {
  constructor(private readonly customerSegmentsService: CustomerSegmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List customer segments for the active store.' })
  listSegments() {
    return this.customerSegmentsService.listSegments();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a customer segment.' })
  getSegment(@Param('id') id: string) {
    return this.customerSegmentsService.getSegment(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a smart-rule customer segment.' })
  createSegment(@Body() dto: UpsertCustomerSegmentDto) {
    return this.customerSegmentsService.createSegment(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer segment.' })
  updateSegment(@Param('id') id: string, @Body() dto: UpsertCustomerSegmentDto) {
    return this.customerSegmentsService.updateSegment(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update customer segment status.' })
  updateSegmentStatus(@Param('id') id: string, @Body() dto: UpdateCustomerSegmentStatusDto) {
    return this.customerSegmentsService.updateSegmentStatus(id, dto.status as CustomerSegmentStatus);
  }

  @Post(':id/evaluate')
  @ApiOperation({ summary: 'Recalculate customer segment membership.' })
  evaluateSegment(@Param('id') id: string) {
    return this.customerSegmentsService.evaluateSegment(id);
  }

  @Get(':id/customers')
  @ApiOperation({ summary: 'List customers currently matched to a segment.' })
  listSegmentCustomers(@Param('id') id: string) {
    return this.customerSegmentsService.listSegmentCustomers(id);
  }
}
