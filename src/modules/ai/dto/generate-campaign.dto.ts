import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateCampaignDto {
  @ApiPropertyOptional({ example: 'Increase afternoon sales' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  goal?: string;

  @ApiPropertyOptional({ example: '2pm-5pm' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeWindow?: string;

  @ApiPropertyOptional({ example: 'Cold drinks' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  focusCategory?: string;

  @ApiPropertyOptional({ example: 'Need a low-cost campaign with high conversion.' })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;
}
