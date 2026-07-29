import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import type { BusinessDailyCampaignTemplate, BusinessDailyPreset, BusinessDailyRecommendationType } from '../business-daily.types';

export class BusinessDailyQueryDto {
  @ApiPropertyOptional({ enum: ['today', 'yesterday', 'last7days', 'custom'] })
  @IsOptional()
  @IsString()
  @IsIn(['today', 'yesterday', 'last7days', 'custom'])
  preset?: BusinessDailyPreset;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreateCampaignDraftFromRecommendationDto {
  @ApiProperty()
  @IsString()
  recommendationId!: string;

  @ApiProperty({ enum: ['SALES', 'PRODUCT', 'CUSTOMER', 'CAMPAIGN', 'KITCHEN', 'REFUND', 'DISCOUNT', 'TABLE'] })
  @IsString()
  @IsIn(['SALES', 'PRODUCT', 'CUSTOMER', 'CAMPAIGN', 'KITCHEN', 'REFUND', 'DISCOUNT', 'TABLE'])
  type!: BusinessDailyRecommendationType;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ enum: ['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'THRESHOLD_DISCOUNT', 'LUNCH_TIME_PROMO'] })
  @IsOptional()
  @IsString()
  @IsIn(['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'THRESHOLD_DISCOUNT', 'LUNCH_TIME_PROMO'])
  campaignTemplate?: BusinessDailyCampaignTemplate;
}
