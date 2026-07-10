import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import type { AnalyticsCompare } from '../analytics.types';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['today', 'yesterday', 'last_7_days', 'last_30_days'])
  preset?: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(['previous_period', 'previous_day', 'previous_week'])
  compare: AnalyticsCompare = 'previous_period';
}

export class ProductAnalyticsQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['revenue', 'units', 'growth', 'decline', 'refunds'])
  sort: 'revenue' | 'units' | 'growth' | 'decline' | 'refunds' = 'revenue';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
