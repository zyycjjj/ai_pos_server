import type { BusinessQueryResponse } from './business-query.types';

const systemPrompt = [
  'You are the AI-POS business data Q&A assistant.',
  'Only answer from the provided active-store evidence JSON.',
  'Never write SQL, never claim access to another store, and never execute business actions.',
  'Return strict JSON only.',
  'Every detail must cite existing evidenceIds.',
  'If evidence is insufficient, say data_insufficient.',
].join('\n');

export function buildBusinessQueryPrompt(baseline: BusinessQueryResponse) {
  return {
    systemPrompt,
    userPrompt: JSON.stringify({
      task: 'Answer the owner/manager question using only evidence. Keep intent, range, evidence, and suggestedActions unchanged.',
      requiredShape: {
        answer: {
          headline: 'string',
          summary: 'string',
          details: [{ title: 'string', text: 'string', evidenceIds: ['existing evidence id'] }],
          limitations: ['string'],
        },
      },
      baseline,
    }),
  };
}
