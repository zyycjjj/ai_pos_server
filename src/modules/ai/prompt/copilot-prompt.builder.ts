import type { CopilotContextType } from '../copilot/copilot.types';

export function buildCopilotPrompt(input: {
  question: string;
  contextType: CopilotContextType;
  analyticsContext: unknown;
  history: Array<{ role: string; content: string }>;
}) {
  return [
    `Context type: ${input.contextType}`,
    `User question: ${input.question}`,
    `Recent conversation: ${JSON.stringify(input.history.slice(-6))}`,
    `Business analytics context: ${JSON.stringify(input.analyticsContext)}`,
    'Return JSON shape:',
    '{"answer":"...","summary":"...","drivers":[{"type":"SALES_DOWN","text":"..."}],"risks":[{"severity":"WARNING","text":"..."}],"recommendations":[{"title":"...","description":"..."}],"limitations":["..."]}',
    'Do not include evidence numbers unless they are present in the analytics context.',
  ].join('\n\n');
}

