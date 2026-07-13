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

export type AiStructuredProviderRequest = {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
};

export type AiStructuredProviderResponse = AiJsonCompletion & {
  provider: string;
  latencyMs: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
};

export interface AiStructuredProvider {
  generateStructuredResponse(input: AiStructuredProviderRequest): Promise<AiStructuredProviderResponse | null>;
}
