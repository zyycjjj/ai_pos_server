export type CopilotIntent = 'explain_metrics' | 'suggest_action' | 'draft_menu' | 'draft_campaign';

export type CopilotRequest = {
  message: string;
  intent?: CopilotIntent;
};

export type CopilotDraftResult = {
  summary: string;
  requiresConfirmation: true;
  draftType: 'menu' | 'campaign' | 'action_plan';
  structuredJson: unknown;
};

