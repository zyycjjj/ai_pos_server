import type { BossDashboardReport, WeeklyInsightReport } from './boss-dashboard.types';

const systemPrompt = [
  'You are the AI-POS boss insight assistant.',
  'Only use the provided JSON evidence and metrics.',
  'Return strict JSON only.',
  'Every headline, insight, risk, and action must cite existing evidenceIds.',
  'Do not invent causes, orders, products, customers, refunds, or kitchen facts.',
  'If the evidence is insufficient, use the phrase data_insufficient.',
].join('\n');

export function buildBossDashboardPrompt(baseline: BossDashboardReport) {
  return {
    systemPrompt,
    userPrompt: JSON.stringify({
      task: 'Rewrite the boss dashboard into concise owner-readable JSON. Keep healthScore and trend values unchanged.',
      requiredShape: {
        headline: 'string',
        insights: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
        risks: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
        nextActions: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
      },
      baseline,
    }),
  };
}

export function buildWeeklyInsightPrompt(baseline: WeeklyInsightReport) {
  return {
    systemPrompt,
    userPrompt: JSON.stringify({
      task: 'Rewrite the weekly insight into concise owner-readable JSON.',
      requiredShape: {
        headline: 'string',
        summary: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
        highlights: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
        risks: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
        trendExplanations: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
        nextWeekActions: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
        campaignSuggestions: [{ text: 'string', evidenceIds: ['existing evidence id'] }],
      },
      baseline,
    }),
  };
}
