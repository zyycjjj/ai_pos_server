import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

import { CreateOrderItemDto, CreateOrderPaymentLineDto } from '@/modules/checkout/dto/create-order.dto';

export class UpsertDiningAreaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpsertDiningTableDto {
  @ApiProperty()
  @IsString()
  areaId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['AVAILABLE', 'OCCUPIED', 'DIRTY', 'RESERVED', 'INACTIVE'], default: 'AVAILABLE' })
  @IsOptional()
  @IsString()
  @IsIn(['AVAILABLE', 'OCCUPIED', 'DIRTY', 'RESERVED', 'INACTIVE'])
  status?: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'RESERVED' | 'INACTIVE';
}

export class OpenTableDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount: number;
}

export class AddTableItemsDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class UpdateTableOrderItemDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class DeleteTableOrderItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class BatchCreateDiningTablesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  areaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  areaName?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  prefix: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startNumber: number;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  count: number;

  @ApiPropertyOptional({ minimum: 1, default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  digits?: number;

  @ApiPropertyOptional({ minimum: 1, default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultSeats?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}

export class CheckoutTableDto {
  @ApiProperty({ type: [CreateOrderPaymentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderPaymentLineDto)
  payments: CreateOrderPaymentLineDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tip?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string;
}

export class CancelTableOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class TransferTableDto {
  @ApiProperty()
  @IsString()
  targetTableId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class MergeTableDto {
  @ApiProperty()
  @IsString()
  targetTableId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class SplitBillItemDto {
  @ApiProperty()
  @IsString()
  orderItemId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class SplitBillDto {
  @ApiProperty({ type: [SplitBillItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitBillItemDto)
  items: SplitBillItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
