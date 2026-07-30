import type { AiQualityValidationIssue } from './ai-quality.types';

export class AiQualityError extends Error {
  constructor(
    message: string,
    readonly moduleName: string,
    readonly issues: AiQualityValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'AiQualityError';
  }
}

export function summarizeIssues(issues: AiQualityValidationIssue[]) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}
