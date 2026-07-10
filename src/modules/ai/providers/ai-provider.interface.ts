export type AiProviderMessage = {
  role: 'system' | 'user';
  content: string;
};

export type AiJsonCompletion = {
  content: string;
  model: string;
};

export interface AiJsonProvider {
  completeJson(messages: AiProviderMessage[]): Promise<AiJsonCompletion | null>;
}

