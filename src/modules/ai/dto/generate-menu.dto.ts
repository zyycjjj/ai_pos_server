import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateMenuDto {
  @ApiPropertyOptional({ example: 'Coffee shop' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessType?: string;

  @ApiPropertyOptional({ example: 'Taiwanese milk tea and espresso drinks' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  cuisine?: string;

  @ApiPropertyOptional({ example: '$4-$12' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  priceRange?: string;

  @ApiPropertyOptional({ example: 'warm, modern, quick service' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  brandTone?: string;

  @ApiPropertyOptional({ example: 'Include a few products with ice, sweetness, and toppings modifiers.' })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  notes?: string;
}
