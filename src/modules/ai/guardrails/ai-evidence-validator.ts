import type { AiEvidenceLike, AiEvidenceRefNode, AiQualityValidationIssue } from './ai-quality.types';

export function validateEvidenceRefs(evidence: unknown, nodes: AiEvidenceRefNode[] = []) {
  const issues: AiQualityValidationIssue[] = [];
  const items = Array.isArray(evidence) ? evidence : [];
  if (!Array.isArray(evidence)) {
    issues.push({ path: 'evidence', message: 'Evidence must be an array.' });
  }

  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isObject(item)) {
      issues.push({ path: `evidence.${index}`, message: 'Evidence item must be an object.' });
      continue;
    }
    if (!nonEmptyString(item.id)) issues.push({ path: `evidence.${index}.id`, message: 'Evidence id is required.' });
    if (!nonEmptyString(item.type)) issues.push({ path: `evidence.${index}.type`, message: 'Evidence type is required.' });
    if (!nonEmptyString(item.title)) issues.push({ path: `evidence.${index}.title`, message: 'Evidence title is required.' });
    if (nonEmptyString(item.id)) ids.add(item.id);
  }

  for (const node of nodes) {
    const refIds = Array.isArray(node.evidenceIds) ? node.evidenceIds : [];
    if (node.required && refIds.length === 0) {
      issues.push({ path: node.path, message: 'Evidence ids are required.' });
      continue;
    }
    for (const [index, id] of refIds.entries()) {
      if (typeof id !== 'string' || !ids.has(id)) {
        issues.push({ path: `${node.path}.evidenceIds.${index}`, message: `Unknown evidence id: ${String(id)}` });
      }
    }
  }

  return {
    ok: issues.length === 0,
    evidence: items.filter(isEvidenceLike),
    evidenceIds: ids,
    issues,
  };
}

export function collectEvidenceRefNodes(value: unknown, options: { requiredPaths?: Set<string>; maxDepth?: number } = {}) {
  const nodes: AiEvidenceRefNode[] = [];
  visit(value, '$', 0);
  return nodes;

  function visit(current: unknown, path: string, depth: number) {
    if (depth > (options.maxDepth ?? 8)) return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}.${index}`, depth + 1));
      return;
    }
    if (!isObject(current)) return;
    if ('evidenceIds' in current) {
      nodes.push({
        path,
        evidenceIds: current.evidenceIds,
        required: options.requiredPaths?.has(path) ?? true,
      });
    }
    for (const [key, child] of Object.entries(current)) {
      if (key === 'evidence') continue;
      visit(child, `${path}.${key}`, depth + 1);
    }
  }
}

function isEvidenceLike(value: unknown): value is AiEvidenceLike {
  return isObject(value) && nonEmptyString(value.id) && nonEmptyString(value.type) && nonEmptyString(value.title);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
