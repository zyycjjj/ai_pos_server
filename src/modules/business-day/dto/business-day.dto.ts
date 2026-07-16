import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class OpenBusinessDayDto {
  @ApiPropertyOptional({ description: 'Business date in YYYY-MM-DD format. Defaults to today.' })
  @IsOptional()
  @IsDateString()
  businessDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

export class CloseBusinessDayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}
