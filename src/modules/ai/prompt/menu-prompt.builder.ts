import type { GenerateMenuDto } from '../dto/generate-menu.dto';

export const MENU_GENERATION_SYSTEM_PROMPT =
  'You generate POS menus as strict JSON only. Return categories and products. Products may include modifierGroups. No markdown.';

export function buildMenuGenerationPrompt(dto: GenerateMenuDto) {
  return [
    'Create a realistic lightweight POS menu.',
    'Return JSON shape: {"categories":[{"name":"Coffee"}],"products":[{"name":"Latte","category":"Coffee","price":5.5,"description":"...","active":true,"modifierGroups":[{"name":"Milk","required":false,"multiSelect":false,"displayOrder":1,"options":[{"name":"Oat","priceDelta":0.75,"displayOrder":1}]}]}.',
    'Rules: at least 6 products, at most 20 products, prices are numbers, categories must match product.category, active defaults true.',
    `Business type: ${dto.businessType?.trim() || 'small cafe or food truck'}`,
    `Cuisine/style: ${dto.cuisine?.trim() || 'merchant appropriate'}`,
    `Price range: ${dto.priceRange?.trim() || 'reasonable counter-service prices'}`,
    `Brand tone: ${dto.brandTone?.trim() || 'clear and simple'}`,
    `Notes: ${dto.notes?.trim() || 'Include modifier groups where useful.'}`,
  ].join('\n');
}

