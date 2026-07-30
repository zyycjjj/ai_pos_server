import { summarizeIssues } from './ai-quality-errors';

export async function runAiProviderWithFallback<T>(input: {
  moduleName: string;
  fallback: T;
  runProvider: () => Promise<T | null | undefined>;
  validate?: (value: T) => { ok: boolean; issues?: Array<{ path: string; message: string }> };
  onFallback?: (reason: string) => void;
}): Promise<T> {
  try {
    const value = await input.runProvider();
    if (!value) return input.fallback;
    const validation = input.validate?.(value);
    if (validation && !validation.ok) {
      input.onFallback?.(`${input.moduleName} validation failed: ${summarizeIssues(validation.issues ?? [])}`);
      return input.fallback;
    }
    return value;
  } catch (error) {
    input.onFallback?.(error instanceof Error ? error.message : `${input.moduleName} provider failed`);
    return input.fallback;
  }
}
