import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import type { BusinessDailyCampaignTemplate, BusinessDailyPreset, BusinessDailyRecommendationType } from '../business-daily.types';
import type { AiCampaignRecommendationType } from '../../campaign-recommendation/campaign-recommendation.types';

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

  @ApiPropertyOptional({ enum: ['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'AOV_THRESHOLD_PROMO', 'OFF_PEAK_PROMO', 'KITCHEN_LOAD_BALANCE'] })
  @IsOptional()
  @IsString()
  @IsIn(['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'AOV_THRESHOLD_PROMO', 'OFF_PEAK_PROMO', 'KITCHEN_LOAD_BALANCE'])
  type?: AiCampaignRecommendationType;
}

export class CampaignDraftAdjustmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  discountValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  durationDays?: number;
}

export class CreateCampaignDraftFromRecommendationDto {
  @ApiProperty()
  @IsString()
  recommendationId!: string;

  @ApiPropertyOptional({ enum: ['SALES', 'PRODUCT', 'CUSTOMER', 'CAMPAIGN', 'KITCHEN', 'REFUND', 'DISCOUNT', 'TABLE'] })
  @IsOptional()
  @IsString()
  @IsIn(['SALES', 'PRODUCT', 'CUSTOMER', 'CAMPAIGN', 'KITCHEN', 'REFUND', 'DISCOUNT', 'TABLE'])
  type?: BusinessDailyRecommendationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: ['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'THRESHOLD_DISCOUNT', 'LUNCH_TIME_PROMO'] })
  @IsOptional()
  @IsString()
  @IsIn(['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'THRESHOLD_DISCOUNT', 'LUNCH_TIME_PROMO'])
  campaignTemplate?: BusinessDailyCampaignTemplate;

  @ApiPropertyOptional({ enum: ['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'AOV_THRESHOLD_PROMO', 'OFF_PEAK_PROMO', 'KITCHEN_LOAD_BALANCE'] })
  @IsOptional()
  @IsString()
  @IsIn(['CUSTOMER_REACTIVATION', 'TOP_CUSTOMER_REWARD', 'LOW_SELLING_PRODUCT_PROMO', 'AOV_THRESHOLD_PROMO', 'OFF_PEAK_PROMO', 'KITCHEN_LOAD_BALANCE'])
  recommendationType?: AiCampaignRecommendationType;

  @ApiPropertyOptional({ default: 'today' })
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

  @ApiPropertyOptional()
  @IsOptional()
  adjustments?: CampaignDraftAdjustmentsDto;
}
