import type { SafeParseAiJsonResult } from './ai-quality.types';

const MAX_AI_JSON_TEXT = 80_000;

export function safeParseAiJson<T = unknown>(providerName: string, rawText: unknown): SafeParseAiJsonResult<T> {
  const source = providerName || 'unknown-provider';
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return { ok: false, error: 'AI provider returned empty content.', source, preview: '' };
  }

  const normalized = rawText.trim().slice(0, MAX_AI_JSON_TEXT);
  const candidate = extractJsonCandidate(normalized);
  if (!candidate) {
    return { ok: false, error: 'AI provider content does not contain JSON.', source, preview: normalized.slice(0, 500) };
  }

  try {
    const parsed = JSON.parse(candidate) as T;
    if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
      return { ok: false, error: 'AI provider JSON must be an object or array.', source, preview: candidate.slice(0, 500) };
    }
    return { ok: true, value: parsed, source };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'AI provider JSON parse failed.',
      source,
      preview: candidate.slice(0, 500),
    };
  }
}

function extractJsonCandidate(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const text = (fenced?.[1] ?? value).trim();
  if (startsAsJson(text)) return text;

  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) return null;

  const start = Math.min(...starts);
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  if (end <= start) return null;
  return text.slice(start, end + 1).trim();
}

function startsAsJson(value: string) {
  return value.startsWith('{') || value.startsWith('[');
}
