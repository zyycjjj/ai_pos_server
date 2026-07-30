import { IsArray, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AiActionPriority, AiActionSourceType, AiActionStatus, AiActionTargetType, AiActionType } from '@prisma/client';

export class CreateAiActionDto {
  @IsEnum(AiActionSourceType)
  sourceType!: AiActionSourceType;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  sourceTitle?: string;

  @IsEnum(AiActionType)
  actionType!: AiActionType;

  @IsOptional()
  @IsEnum(AiActionPriority)
  priority?: AiActionPriority;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsEnum(AiActionTargetType)
  targetType?: AiActionTargetType;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  targetUrl?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  evidenceSnapshot?: unknown[];
}

export class ListAiActionsQueryDto {
  @IsOptional()
  @IsEnum(AiActionStatus)
  status?: AiActionStatus;

  @IsOptional()
  @IsEnum(AiActionPriority)
  priority?: AiActionPriority;

  @IsOptional()
  @IsEnum(AiActionSourceType)
  sourceType?: AiActionSourceType;

  @IsOptional()
  @IsEnum(AiActionType)
  actionType?: AiActionType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class UpdateAiActionDto {
  @IsEnum(AiActionStatus)
  status!: AiActionStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  dismissReason?: string;
}
