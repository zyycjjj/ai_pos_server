import { BadRequestException } from '@nestjs/common';

import type { CopilotStructuredResponse } from '../copilot/copilot.types';
import { parseStructuredJsonObject } from './structured-json.parser';

export function parseCopilotResponse(content: string): Omit<CopilotStructuredResponse, 'evidence'> {
  const value = parseStructuredJsonObject(content);
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('AI copilot response JSON is invalid.');
  }

  const candidate = value as Partial<Omit<CopilotStructuredResponse, 'evidence'>>;
  return {
    answer: requiredText(candidate.answer, 'answer'),
    summary: requiredText(candidate.summary, 'summary'),
    drivers: normalizeTextCards(candidate.drivers, 'GENERAL'),
    risks: normalizeRisks(candidate.risks),
    recommendations: normalizeRecommendations(candidate.recommendations),
    limitations: Array.isArray(candidate.limitations)
      ? candidate.limitations.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 6)
      : [],
  };
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`AI copilot response is missing ${field}.`);
  }
  return value.trim();
}

function normalizeTextCards(value: unknown, fallbackType: string) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const candidate = item as { type?: unknown; text?: unknown };
      const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
      if (!text) return null;
      return { type: typeof candidate.type === 'string' ? candidate.type : fallbackType, text };
    })
    .filter((item): item is { type: string; text: string } => Boolean(item))
    .slice(0, 6);
}

function normalizeRisks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const candidate = item as { severity?: unknown; text?: unknown };
      const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
      if (!text) return null;
      return { severity: candidate.severity === 'WARNING' ? 'WARNING' : 'INFO', text } as const;
    })
    .filter((item): item is { severity: 'INFO' | 'WARNING'; text: string } => Boolean(item))
    .slice(0, 6);
}

function normalizeRecommendations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const candidate = item as { title?: unknown; description?: unknown };
      const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
      const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
      if (!title || !description) return null;
      return { title, description };
    })
    .filter((item): item is { title: string; description: string } => Boolean(item))
    .slice(0, 6);
}

