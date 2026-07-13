import { Injectable } from '@nestjs/common';

import type { CopilotContextType } from '../copilot/copilot.types';

const rules: Array<{ type: CopilotContextType; keywords: string[] }> = [
  { type: 'REFUND', keywords: ['refund', 'return', 'void', 'cancel'] },
  { type: 'KITCHEN', keywords: ['kitchen', 'station', 'prep', 'slow', 'ready', 'ticket'] },
  { type: 'SHIFT', keywords: ['shift', 'cash', 'variance', 'drawer'] },
  { type: 'PAYMENT', keywords: ['payment', 'cash', 'card', 'paying', 'paid'] },
  { type: 'MODIFIER', keywords: ['modifier', 'addon', 'add-on', 'topping', 'option'] },
  { type: 'PRODUCT', keywords: ['product', 'item', 'menu', 'seller', 'underperform', 'popular'] },
  { type: 'CATEGORY', keywords: ['category', 'categories'] },
  { type: 'SALES', keywords: ['sales', 'revenue', 'business', 'today', 'yesterday', 'week', 'down', 'up', 'peak', 'hour'] },
];

@Injectable()
export class CopilotContextRouter {
  resolve(message: string): CopilotContextType {
    const normalized = message.toLowerCase();
    return rules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)))?.type ?? 'GENERAL';
  }
}

