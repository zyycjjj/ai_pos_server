import { validateEvidenceRefs } from './ai-evidence-validator';
import type { AiOutputSchema, AiQualityValidationIssue, AiQualityValidationResult } from './ai-quality.types';

export function validateAiOutput<T>(moduleName: string, output: T, schema: AiOutputSchema, options: { evidence?: unknown } = {}): AiQualityValidationResult<T> {
  const issues: AiQualityValidationIssue[] = [];
  if (!isObject(output)) {
    return { ok: false, issues: [{ path: '$', message: `${moduleName} output must be an object.` }] };
  }

  for (const path of schema.requiredFields ?? []) {
    if (readPath(output, path) === undefined || readPath(output, path) === null) issues.push({ path, message: 'Required field is missing.' });
  }
  for (const path of schema.arrayFields ?? []) {
    if (!Array.isArray(readPath(output, path))) issues.push({ path, message: 'Field must be an array.' });
  }
  for (const path of schema.nonEmptyTextFields ?? []) {
    const value = readPath(output, path);
    if (typeof value !== 'string' || value.trim().length === 0) issues.push({ path, message: 'Field must be non-empty text.' });
  }
  for (const [path, allowed] of Object.entries(schema.enumFields ?? {})) {
    const value = readPath(output, path);
    if (typeof value !== 'string' || !allowed.includes(value)) issues.push({ path, message: `Field must be one of ${allowed.join(', ')}.` });
  }

  const evidence = options.evidence ?? readPath(output, 'evidence');
  if (schema.evidenceRequired && (!Array.isArray(evidence) || evidence.length === 0)) {
    issues.push({ path: 'evidence', message: 'Evidence is required when business data exists.' });
  }
  if (evidence !== undefined || (schema.evidenceNodes?.length ?? 0) > 0) {
    const evidenceResult = validateEvidenceRefs(evidence, schema.evidenceNodes ?? []);
    issues.push(...evidenceResult.issues);
  }

  return { ok: issues.length === 0, value: output, issues };
}

export function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) return /^\d+$/.test(key) ? current[Number(key)] : undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
