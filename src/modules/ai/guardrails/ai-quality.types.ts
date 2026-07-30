export type AiEvidenceLike = {
  id: string;
  type: string;
  title: string;
  value?: number | string | null;
  refId?: string | null;
  detail?: Record<string, unknown>;
  source?: Record<string, unknown>;
};

export type AiEvidenceRefNode = {
  path: string;
  label?: string;
  evidenceIds?: unknown;
  required?: boolean;
};

export type AiQualityValidationIssue = {
  path: string;
  message: string;
};

export type AiQualityValidationResult<T = unknown> = {
  ok: boolean;
  value?: T;
  issues: AiQualityValidationIssue[];
};

export type AiOutputSchema = {
  requiredFields?: string[];
  arrayFields?: string[];
  nonEmptyTextFields?: string[];
  enumFields?: Record<string, readonly string[]>;
  evidenceNodes?: AiEvidenceRefNode[];
  evidenceRequired?: boolean;
};

export type SafeParseAiJsonResult<T = unknown> =
  | { ok: true; value: T; source: string }
  | { ok: false; error: string; source: string; preview: string };

export type AiSuggestedActionLike = {
  kind?: unknown;
  actionType?: unknown;
  type?: unknown;
  priority?: unknown;
  label?: unknown;
  title?: unknown;
  href?: unknown;
  targetUrl?: unknown;
  evidenceIds?: unknown;
  payload?: unknown;
};
