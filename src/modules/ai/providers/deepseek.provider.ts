import { Injectable } from '@nestjs/common';

import type { AiStructuredProvider, AiStructuredProviderRequest } from './ai-provider.interface';

@Injectable()
export class DeepSeekProvider implements AiStructuredProvider {
  async generateStructuredResponse(input: AiStructuredProviderRequest) {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return null;

    const startedAt = Date.now();
    const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
    const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 12_000);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek copilot generation failed with ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        provider: 'deepseek',
        model,
        content: data.choices?.[0]?.message?.content ?? '',
        latencyMs: Date.now() - startedAt,
        inputTokenCount: data.usage?.prompt_tokens,
        outputTokenCount: data.usage?.completion_tokens,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

