import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class OrderReasonDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class VoidOrderDto extends OrderReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approvedById?: string;
}

export class RefundOrderItemDto {
  @ApiProperty()
  @IsString()
  orderItemId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class RefundOrderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  idempotencyKey: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ enum: ['CASH', 'CARD', 'MANUAL'] })
  @IsOptional()
  @IsString()
  @IsIn(['CASH', 'CARD', 'MANUAL'])
  method?: 'CASH' | 'CARD' | 'MANUAL';

  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ type: [RefundOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundOrderItemDto)
  items?: RefundOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approvedById?: string;
}
