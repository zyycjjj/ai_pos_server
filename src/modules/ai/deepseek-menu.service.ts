import { Injectable } from '@nestjs/common';

import type { GenerateMenuDto } from './dto/generate-menu.dto';
import { buildMenuGenerationPrompt, MENU_GENERATION_SYSTEM_PROMPT } from './prompt/menu-prompt.builder';
import type { AiJsonProvider, AiProviderMessage } from './providers/ai-provider.interface';

@Injectable()
export class DeepSeekMenuService implements AiJsonProvider {
  async generate(dto: GenerateMenuDto) {
    return this.completeJson([
      {
        role: 'system',
        content: MENU_GENERATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildMenuGenerationPrompt(dto),
      },
    ]);
  }

  async completeJson(messages: AiProviderMessage[]) {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }

    const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
    const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek menu generation failed with ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      model,
    };
  }
}

