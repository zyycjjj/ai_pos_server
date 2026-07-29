import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePermissionPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundRequiresApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  voidRequiresApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  preparedItemCancelRequiresApproval?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  manualDiscountApprovalThreshold?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cashOutApprovalThreshold?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundApprovalThreshold?: number;
}
