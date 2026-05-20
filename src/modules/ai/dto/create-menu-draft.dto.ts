import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMenuDraftDto {
  @ApiProperty({
    example: 'coffee truck menu with espresso, latte, seasonal drinks, and pastries',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}
