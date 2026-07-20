import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListCustomersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'] })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE', 'BLOCKED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'] })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE', 'BLOCKED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
}

export class LookupCustomerDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  phone: string;
}

export class QuickCreateCustomerDto extends CreateCustomerDto {}
