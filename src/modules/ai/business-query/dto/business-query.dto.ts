import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { BusinessDailyPreset } from '../../business-daily/business-daily.types';

export class BusinessQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  question!: string;

  @ApiPropertyOptional({ enum: ['today', 'yesterday', 'last7days', 'custom'], default: 'today' })
  @IsOptional()
  @IsString()
  @IsIn(['today', 'yesterday', 'last7days', 'custom'])
  preset?: BusinessDailyPreset;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conversationId?: string | null;

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
