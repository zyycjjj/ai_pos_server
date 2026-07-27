import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateOrderAdjustmentDto {
  @ApiProperty({ enum: ['discount', 'percentage_discount', 'fixed_reduction', 'price_override'] })
  @IsString()
  @IsIn(['discount', 'percentage_discount', 'fixed_reduction', 'price_override'])
  type: 'discount' | 'percentage_discount' | 'fixed_reduction' | 'price_override';

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string;
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
  @ApiPropertyOptional({ enum: ['DINE_IN', 'TAKEAWAY', 'PICKUP'], default: 'TAKEAWAY' })
  @IsOptional()
  @IsString()
  @IsIn(['DINE_IN', 'TAKEAWAY', 'PICKUP'])
  orderType?: 'DINE_IN' | 'TAKEAWAY' | 'PICKUP';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tableId?: string;

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
  taxRate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  serviceChargeRate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  serviceCharge?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoCode?: string;

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPromotionIds?: string[];

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

export class CheckoutPreviewDto {
  @ApiPropertyOptional({ enum: ['DINE_IN', 'TAKEAWAY', 'PICKUP'], default: 'TAKEAWAY' })
  @IsOptional()
  @IsString()
  @IsIn(['DINE_IN', 'TAKEAWAY', 'PICKUP'])
  orderType?: 'DINE_IN' | 'TAKEAWAY' | 'PICKUP';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tableId?: string;

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
  taxRate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  serviceChargeRate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  serviceCharge?: number;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoCode?: string;

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPromotionIds?: string[];

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class HoldOrderDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional({ enum: ['DINE_IN', 'TAKEAWAY', 'PICKUP'], default: 'TAKEAWAY' })
  @IsOptional()
  @IsString()
  @IsIn(['DINE_IN', 'TAKEAWAY', 'PICKUP'])
  orderType?: 'DINE_IN' | 'TAKEAWAY' | 'PICKUP';

  @ApiPropertyOptional({ type: CreateOrderAdjustmentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderAdjustmentDto)
  adjustment?: CreateOrderAdjustmentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoCode?: string;

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPromotionIds?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  serviceChargeRate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tip?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class PayOrderDto {
  @ApiProperty({ type: [CreateOrderPaymentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderPaymentLineDto)
  payments: CreateOrderPaymentLineDto[];

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
