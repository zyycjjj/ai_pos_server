import type { AiActionItem, AiActionPriority, AiActionSourceType, AiActionStatus, AiActionTargetType, AiActionType } from '@prisma/client';

export type AiActionEvidence = {
  id: string;
  type: string;
  title: string;
  value?: number | string | null;
  refId?: string | null;
  detail?: Record<string, unknown>;
  source?: Record<string, unknown>;
};

export type AiActionTarget = {
  type?: AiActionTargetType | string | null;
  id?: string | null;
  url?: string | null;
};

export type NormalizedAiActionInput = {
  sourceType: AiActionSourceType;
  sourceId?: string | null;
  sourceTitle?: string | null;
  actionType: AiActionType;
  priority: AiActionPriority;
  title: string;
  description?: string | null;
  reason?: string | null;
  targetType: AiActionTargetType;
  targetId?: string | null;
  targetUrl?: string | null;
  payload?: Record<string, unknown>;
  evidenceSnapshot?: AiActionEvidence[];
};

export type AiActionSummary = {
  open: number;
  high: number;
  done: number;
  dismissed: number;
};

export type AiActionListResponse = {
  items: AiActionResponse[];
  summary: AiActionSummary;
};

export type AiActionResponse = {
  id: string;
  sourceType: AiActionSourceType;
  sourceId: string | null;
  sourceTitle: string | null;
  actionType: AiActionType;
  priority: AiActionPriority;
  status: AiActionStatus;
  title: string;
  description: string | null;
  reason: string | null;
  targetType: AiActionTargetType;
  targetId: string | null;
  targetUrl: string | null;
  payload: unknown;
  evidenceSnapshot: AiActionEvidence[];
  result: unknown;
  createdByUserId: string;
  assignedToUserId: string | null;
  handledByUserId: string | null;
  handledAt: string | null;
  handledNote: string | null;
  dismissReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export function presentAiAction(item: AiActionItem): AiActionResponse {
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceTitle: item.sourceTitle,
    actionType: item.actionType,
    priority: item.priority,
    status: item.status,
    title: item.title,
    description: item.description,
    reason: item.reason,
    targetType: item.targetType,
    targetId: item.targetId,
    targetUrl: item.targetUrl,
    payload: item.payloadJson,
    evidenceSnapshot: Array.isArray(item.evidenceSnapshotJson) ? item.evidenceSnapshotJson as AiActionEvidence[] : [],
    result: item.resultJson,
    createdByUserId: item.createdByUserId,
    assignedToUserId: item.assignedToUserId,
    handledByUserId: item.handledByUserId,
    handledAt: item.handledAt?.toISOString() ?? null,
    handledNote: item.handledNote,
    dismissReason: item.dismissReason,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
