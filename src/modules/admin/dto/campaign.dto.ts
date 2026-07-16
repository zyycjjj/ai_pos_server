import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertCampaignDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  goal?: string;

  @ApiProperty({ enum: ['ORDER_DISCOUNT', 'THRESHOLD_DISCOUNT', 'ITEM_DISCOUNT', 'PROMO_CODE', 'BUY_X_GET_Y'] })
  @IsString()
  @IsIn(['ORDER_DISCOUNT', 'THRESHOLD_DISCOUNT', 'ITEM_DISCOUNT', 'PROMO_CODE', 'BUY_X_GET_Y'])
  type: 'ORDER_DISCOUNT' | 'THRESHOLD_DISCOUNT' | 'ITEM_DISCOUNT' | 'PROMO_CODE' | 'BUY_X_GET_Y';

  @ApiPropertyOptional({ enum: ['percentage', 'fixed_amount'] })
  @IsOptional()
  @IsString()
  @IsIn(['percentage', 'fixed_amount'])
  discountType?: 'percentage' | 'fixed_amount';

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  thresholdAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string;

  @ApiPropertyOptional({ enum: ['BEST_ONLY', 'STACKABLE', 'EXCLUSIVE'] })
  @IsOptional()
  @IsString()
  @IsIn(['BEST_ONLY', 'STACKABLE', 'EXCLUSIVE'])
  stackingPolicy?: 'BEST_ONLY' | 'STACKABLE' | 'EXCLUSIVE';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;
}

export class UpdateCampaignStatusDto {
  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED'] })
  @IsString()
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED'])
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'ARCHIVED';
}
