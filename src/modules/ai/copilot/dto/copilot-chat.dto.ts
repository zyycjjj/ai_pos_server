import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class CopilotPeriodDto {
  @IsOptional()
  @IsIn(['today', 'yesterday', 'last_7_days', 'last_30_days'])
  preset?: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(['previous_period', 'previous_day', 'previous_week'])
  compare?: 'previous_period' | 'previous_day' | 'previous_week';
}

export class CopilotChatDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsString()
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CopilotPeriodDto)
  period?: CopilotPeriodDto;
}

