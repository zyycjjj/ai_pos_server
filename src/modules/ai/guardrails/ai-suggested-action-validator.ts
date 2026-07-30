import type { AiEvidenceLike, AiQualityValidationIssue, AiSuggestedActionLike } from './ai-quality.types';

const DEFAULT_PRIORITIES = new Set(['HIGH', 'MEDIUM', 'LOW']);

export function validateSuggestedActions(actions: unknown, evidence: AiEvidenceLike[], options: { path?: string; allowedKinds?: readonly string[]; allowedActionTypes?: readonly string[] } = {}) {
  const issues: AiQualityValidationIssue[] = [];
  const path = options.path ?? 'suggestedActions';
  if (!Array.isArray(actions)) {
    issues.push({ path, message: 'Suggested actions must be an array.' });
    return { ok: false, issues };
  }
  const allowedEvidenceIds = new Set(evidence.map((item) => item.id));
  const allowedKinds = options.allowedKinds ? new Set(options.allowedKinds) : null;
  const allowedActionTypes = options.allowedActionTypes ? new Set(options.allowedActionTypes) : null;

  actions.forEach((item: AiSuggestedActionLike, index) => {
    const itemPath = `${path}.${index}`;
    const kind = item.kind ?? item.type;
    const actionType = item.actionType;
    const label = item.label ?? item.title;
    const targetUrl = item.targetUrl ?? item.href;

    if (allowedKinds && (typeof kind !== 'string' || !allowedKinds.has(kind))) issues.push({ path: `${itemPath}.kind`, message: 'Suggested action kind is not allowed.' });
    if (allowedActionTypes && actionType !== undefined && (typeof actionType !== 'string' || !allowedActionTypes.has(actionType))) issues.push({ path: `${itemPath}.actionType`, message: 'Suggested action actionType is not allowed.' });
    if (item.priority !== undefined && (typeof item.priority !== 'string' || !DEFAULT_PRIORITIES.has(item.priority))) issues.push({ path: `${itemPath}.priority`, message: 'Suggested action priority is invalid.' });
    if (typeof label !== 'string' || label.trim().length === 0) issues.push({ path: `${itemPath}.label`, message: 'Suggested action label is required.' });
    if (targetUrl !== undefined && targetUrl !== null && !isSafeInternalTargetUrl(targetUrl)) issues.push({ path: `${itemPath}.targetUrl`, message: 'Suggested action targetUrl must be an internal non-API path.' });

    const evidenceIds = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
    for (const [evidenceIndex, id] of evidenceIds.entries()) {
      if (typeof id !== 'string' || !allowedEvidenceIds.has(id)) {
        issues.push({ path: `${itemPath}.evidenceIds.${evidenceIndex}`, message: `Unknown evidence id: ${String(id)}` });
      }
    }
  });

  return { ok: issues.length === 0, issues };
}

export function isSafeInternalTargetUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const target = value.trim();
  if (!target.startsWith('/')) return false;
  if (target.startsWith('/api') || target.startsWith('//') || target.includes('://')) return false;
  return true;
}
