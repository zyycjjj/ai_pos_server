import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export type CustomerSegmentRuleJson = {
  minOrderCount?: number;
  maxOrderCount?: number;
  minTotalSpend?: number;
  maxTotalSpend?: number;
  lastOrderBeforeDays?: number;
  lastOrderWithinDays?: number;
  minPointsBalance?: number;
  maxPointsBalance?: number;
};

export class UpsertCustomerSegmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: { minTotalSpend: 100, minOrderCount: 2 } })
  @IsObject()
  ruleJson: CustomerSegmentRuleJson;
}

export class UpdateCustomerSegmentStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] })
  @IsString()
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}
