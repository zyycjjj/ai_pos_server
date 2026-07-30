import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import type { BusinessDailyPreset } from '../../business-daily/business-daily.types';

export class RunPlaybookDto {
  @ApiPropertyOptional({ enum: ['today', 'yesterday', 'last7days', 'custom'] })
  @IsOptional()
  @IsString()
  @IsIn(['today', 'yesterday', 'last7days', 'custom'])
  preset?: BusinessDailyPreset;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string | null;

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @IsOptional()
  @IsString()
  timezone?: string;
}
