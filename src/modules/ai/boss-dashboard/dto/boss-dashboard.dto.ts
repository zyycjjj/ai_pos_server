import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import type { BossDashboardPreset } from '../boss-dashboard.types';

export class BossDashboardQueryDto {
  @ApiPropertyOptional({ enum: ['today', 'yesterday', 'last7days', 'thisMonth'], default: 'last7days' })
  @IsOptional()
  @IsString()
  @IsIn(['today', 'yesterday', 'last7days', 'thisMonth'])
  preset?: BossDashboardPreset;

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class WeeklyInsightQueryDto {
  @ApiPropertyOptional({ example: '2026-07-27' })
  @IsOptional()
  @IsString()
  weekStart?: string;

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @IsOptional()
  @IsString()
  timezone?: string;
}
