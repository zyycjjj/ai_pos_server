import { CampaignStatus } from '@prisma/client';

import { AiQualityError } from './ai-quality-errors';
import type { AiEvidenceLike, AiQualityValidationIssue } from './ai-quality.types';

export function assertCampaignDraftSafety(payload: unknown): void {
  const issues = validateCampaignDraftSafety(payload);
  if (issues.length > 0) throw new AiQualityError('Unsafe AI campaign draft payload.', 'ai-campaign-draft', issues);
}

export function validateCampaignDraftSafety(payload: unknown) {
  const issues: AiQualityValidationIssue[] = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [{ path: '$', message: 'Campaign draft payload must be an object.' }];
  }
  const record = payload as Record<string, unknown>;
  const status = record.status;
  if (status !== undefined && status !== CampaignStatus.DRAFT && status !== 'DRAFT') {
    issues.push({ path: 'status', message: 'AI campaign drafts must remain DRAFT.' });
  }
  if (record.autoSend === true || record.autoActivate === true || record.activateNow === true || record.touchCustomers === true) {
    issues.push({ path: 'autoExecution', message: 'AI campaign draft cannot auto-send, auto-activate, or touch customers.' });
  }
  const metadata = readObject(record.aiMetadata) ?? readObject(record.structuredJson)?.aiMetadata ?? record.aiMetadata;
  if (!metadata) issues.push({ path: 'aiMetadata', message: 'AI metadata is required for campaign draft safety.' });
  const evidence = (metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).aiEvidenceSnapshot : record.evidenceSnapshot) as unknown;
  if (!Array.isArray(evidence) || evidence.length === 0 || !evidence.every(isEvidenceLike)) {
    issues.push({ path: 'aiEvidenceSnapshot', message: 'AI campaign draft requires evidence snapshot with id/type/title.' });
  }
  return issues;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isEvidenceLike(value: unknown): value is AiEvidenceLike {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as AiEvidenceLike).id === 'string'
    && typeof (value as AiEvidenceLike).type === 'string'
    && typeof (value as AiEvidenceLike).title === 'string');
}
