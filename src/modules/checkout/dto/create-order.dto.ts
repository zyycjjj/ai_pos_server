import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateOrderAdjustmentDto {
  @ApiProperty({ enum: ['discount', 'fixed_reduction', 'price_override'] })
  @IsString()
  @IsIn(['discount', 'fixed_reduction', 'price_override'])
  type: 'discount' | 'fixed_reduction' | 'price_override';

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;
}

export class CreateOrderPaymentLineDto {
  @ApiProperty({ enum: ['CASH', 'CARD', 'MANUAL'] })
  @IsString()
  @IsIn(['CASH', 'CARD', 'MANUAL'])
  method: 'CASH' | 'CARD' | 'MANUAL';

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountReceived?: number;
}

export class CreateOrderModifierSelectionDto {
  @ApiProperty()
  @IsString()
  groupId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  optionIds: string[];
}

export class CreateOrderItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ type: [CreateOrderModifierSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderModifierSelectionDto)
  modifiers?: CreateOrderModifierSelectionDto[];
}

export class CreateOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tax?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tip?: number;

  @ApiPropertyOptional({ type: CreateOrderAdjustmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderAdjustmentDto)
  adjustment?: CreateOrderAdjustmentDto;

  @ApiProperty({ type: [CreateOrderPaymentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderPaymentLineDto)
  payments: CreateOrderPaymentLineDto[];

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}
