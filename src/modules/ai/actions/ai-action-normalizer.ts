import { BadRequestException, Injectable } from '@nestjs/common';
import { AiActionPriority, AiActionSourceType, AiActionTargetType, AiActionType } from '@prisma/client';

import type { CreateAiActionDto } from './dto/ai-action.dto';
import type { AiActionEvidence, NormalizedAiActionInput } from './ai-actions.types';

const sourceTypes = new Set(Object.values(AiActionSourceType));
const actionTypes = new Set(Object.values(AiActionType));
const priorities = new Set(Object.values(AiActionPriority));
const targetTypes = new Set(Object.values(AiActionTargetType));

@Injectable()
export class AiActionNormalizer {
  normalize(dto: CreateAiActionDto): NormalizedAiActionInput {
    const sourceType = assertEnum(sourceTypes, dto.sourceType, 'sourceType');
    const actionType = assertEnum(actionTypes, dto.actionType, 'actionType');
    const priority = dto.priority ? assertEnum(priorities, dto.priority, 'priority') : AiActionPriority.MEDIUM;
    const targetType = dto.targetType ? assertEnum(targetTypes, dto.targetType, 'targetType') : inferTargetType(actionType);
    const title = cleanText(dto.title, 160, 'title');
    const evidenceSnapshot = normalizeEvidence(dto.evidenceSnapshot);
    if (actionType !== AiActionType.MANUAL_NOTE && evidenceSnapshot.length === 0) {
      throw new BadRequestException('AI action evidenceSnapshot is required.');
    }
    return {
      sourceType,
      sourceId: optionalText(dto.sourceId, 120),
      sourceTitle: optionalText(dto.sourceTitle, 180),
      actionType,
      priority,
      title,
      description: optionalText(dto.description, 1200),
      reason: optionalText(dto.reason, 1200),
      targetType,
      targetId: optionalText(dto.targetId, 120),
      targetUrl: normalizeTargetUrl(dto.targetUrl),
      payload: sanitizePayload(dto.payload),
      evidenceSnapshot,
    };
  }
}

function inferTargetType(actionType: AiActionType) {
  const map: Partial<Record<AiActionType, AiActionTargetType>> = {
    VIEW_REPORT: AiActionTargetType.REPORT,
    VIEW_ORDER: AiActionTargetType.ORDER,
    VIEW_PRODUCT: AiActionTargetType.PRODUCT,
    VIEW_CUSTOMER: AiActionTargetType.CUSTOMER,
    VIEW_CAMPAIGN: AiActionTargetType.CAMPAIGN,
    VIEW_KITCHEN: AiActionTargetType.KITCHEN_STATION,
    VIEW_TABLE: AiActionTargetType.TABLE,
    CREATE_CAMPAIGN_DRAFT: AiActionTargetType.AI_RECOMMENDATION,
    REVIEW_REFUND: AiActionTargetType.REPORT,
    REVIEW_DISCOUNT: AiActionTargetType.REPORT,
    REVIEW_KITCHEN_OVERDUE: AiActionTargetType.KITCHEN_STATION,
    REVIEW_CUSTOMER_REACTIVATION: AiActionTargetType.CUSTOMER,
    MANUAL_NOTE: AiActionTargetType.NONE,
  };
  return map[actionType] ?? AiActionTargetType.NONE;
}

function normalizeEvidence(input: unknown): AiActionEvidence[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input
    .map((item): AiActionEvidence | null => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Partial<AiActionEvidence>;
      if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' || typeof candidate.type !== 'string') return null;
      const id = candidate.id.slice(0, 160);
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        type: candidate.type.slice(0, 80),
        title: candidate.title.slice(0, 240),
        value: typeof candidate.value === 'number' || typeof candidate.value === 'string' || candidate.value === null ? candidate.value : undefined,
        refId: typeof candidate.refId === 'string' ? candidate.refId.slice(0, 160) : null,
        detail: isPlainObject(candidate.detail) ? candidate.detail : undefined,
        source: isPlainObject(candidate.source) ? candidate.source : undefined,
      };
    })
    .filter((item): item is AiActionEvidence => item !== null)
    .slice(0, 20);
}

function normalizeTargetUrl(input: unknown) {
  const value = optionalText(input, 240);
  if (!value) return null;
  if (!value.startsWith('/')) throw new BadRequestException('AI action targetUrl must be an internal path.');
  if (value.startsWith('/api') || value.includes('://')) throw new BadRequestException('AI action targetUrl must not point to an API or external URL.');
  return value;
}

function sanitizePayload(input: unknown) {
  if (!isPlainObject(input)) return {};
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

function assertEnum<T extends string>(allowed: Set<T>, value: unknown, name: string): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) throw new BadRequestException(`Invalid AI action ${name}.`);
  return value as T;
}

function cleanText(value: unknown, max: number, name: string) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new BadRequestException(`AI action ${name} is required.`);
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
