import type { BusinessQueryResponse } from '../../business-query/business-query.types';

export function businessQueryFixture(): BusinessQueryResponse {
  return {
    conversationId: 'conv_eval',
    messageId: 'msg_eval',
    question: 'How are sales today?',
    intent: 'SALES_ANALYSIS',
    resolvedIntent: 'SALES_ANALYSIS',
    isFollowUp: false,
    contextUsed: { previousIntent: null, previousRange: null, usedPreviousEvidence: false, expandedEvidence: false },
    range: { from: '2026-07-30', to: '2026-07-30', timezone: 'Asia/Shanghai', preset: 'today' },
    answer: {
      headline: 'Net sales were 60.00 from 2 orders.',
      summary: 'Average order value was 30.00.',
      details: [{ title: 'Sales level', text: 'Two orders generated 60.00 net sales.', evidenceIds: ['query_ev_sales_net'] }],
      limitations: [],
    },
    evidence: [{ id: 'query_ev_sales_net', type: 'METRIC', title: 'Net sales', value: 60 }],
    suggestedActions: [{ kind: 'VIEW_REPORT', label: 'View reports', href: '/reports', evidenceIds: ['query_ev_sales_net'] }],
    fallback: true,
    generatedAt: '2026-07-30T00:00:00.000Z',
  };
}
