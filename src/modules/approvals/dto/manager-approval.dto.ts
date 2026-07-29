import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ManagerApprovalDto {
  @ApiProperty()
  @IsString()
  managerUserId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  pin!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SetManagerPinDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[0-9]+$/)
  pin!: string;
}

export class ApprovalCheckDto {
  @ApiProperty()
  @IsString()
  action!: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ type: ManagerApprovalDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ManagerApprovalDto)
  managerApproval?: ManagerApprovalDto;
}
