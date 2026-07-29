import type { BusinessDailyReport } from './business-daily.types';

export function buildBusinessDailyPrompt(report: BusinessDailyReport) {
  return {
    systemPrompt: [
      'You are an AI business daily analyst for a lightweight restaurant POS.',
      'Return strict JSON only.',
      'Use only the provided JSON metrics and evidence.',
      'Do not invent facts, IDs, orders, products, customers, or causes.',
      'Every summary, highlight, risk, and recommendation must reference at least one existing evidenceId.',
      'If evidence is insufficient, write data_insufficient in the text.',
    ].join('\n'),
    userPrompt: JSON.stringify({
      instruction: 'Improve the business daily wording while preserving JSON shape. You may reprioritize recommendations, but evidenceIds must come from evidence[].id.',
      allowedShape: {
        summary: { text: 'string', evidenceIds: ['evidence id'] },
        highlights: [{ text: 'string', evidenceIds: ['evidence id'] }],
        risks: [{ text: 'string', evidenceIds: ['evidence id'] }],
        recommendations: [{
          id: 'string',
          type: 'SALES|PRODUCT|CUSTOMER|CAMPAIGN|KITCHEN|REFUND|DISCOUNT|TABLE',
          priority: 'HIGH|MEDIUM|LOW',
          title: 'string',
          reason: 'string',
          evidenceIds: ['evidence id'],
          action: { kind: 'NONE|CREATE_CAMPAIGN_DRAFT', label: 'string', campaignTemplate: 'optional allowed template' },
        }],
      },
      input: report,
    }),
  };
}
