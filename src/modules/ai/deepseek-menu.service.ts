import { Injectable } from '@nestjs/common';

import type { GenerateMenuDto } from './dto/generate-menu.dto';

type DeepSeekMessage = {
  role: 'system' | 'user';
  content: string;
};

@Injectable()
export class DeepSeekMenuService {
  async generate(dto: GenerateMenuDto) {
    return this.completeJson([
      {
        role: 'system',
        content:
          'You generate POS menus as strict JSON only. Return categories and products. Products may include modifierGroups. No markdown.',
      },
      {
        role: 'user',
        content: this.buildPrompt(dto),
      },
    ]);
  }

  async completeJson(messages: DeepSeekMessage[]) {
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

  private buildPrompt(dto: GenerateMenuDto) {
    return [
      'Create a realistic lightweight POS menu.',
      'Return JSON shape: {"categories":[{"name":"Coffee"}],"products":[{"name":"Latte","category":"Coffee","price":5.5,"description":"...","active":true,"modifierGroups":[{"name":"Milk","required":false,"multiSelect":false,"displayOrder":1,"options":[{"name":"Oat","priceDelta":0.75,"displayOrder":1}]}]}]}.',
      'Rules: at least 6 products, at most 20 products, prices are numbers, categories must match product.category, active defaults true.',
      `Business type: ${dto.businessType?.trim() || 'small cafe or food truck'}`,
      `Cuisine/style: ${dto.cuisine?.trim() || 'merchant appropriate'}`,
      `Price range: ${dto.priceRange?.trim() || 'reasonable counter-service prices'}`,
      `Brand tone: ${dto.brandTone?.trim() || 'clear and simple'}`,
      `Notes: ${dto.notes?.trim() || 'Include modifier groups where useful.'}`,
    ].join('\n');
  }
}
