import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ListKitchenTicketsDto {
  @IsOptional()
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsIn(['NEW', 'PREPARING', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'])
  status?: 'NEW' | 'PREPARING' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  take?: number;
}

export class ListKitchenTicketHistoryDto extends ListKitchenTicketsDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}

export class UpsertKitchenStationDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(24)
  code!: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  warningMinutes?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  overdueMinutes?: number;
}

export class UpdateKitchenStationStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

export class CancelKitchenTicketDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class UpdateKitchenPrintModeDto {
  @IsIn(['ORDER_TICKET', 'ITEM_TICKET'])
  mode!: 'ORDER_TICKET' | 'ITEM_TICKET';
}

export class UpdateKitchenTicketPriorityDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AssignKitchenStaffStationsDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stationIds?: string[];
}
