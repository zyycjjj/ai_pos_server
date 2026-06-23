export type AiMenuCategory = {
  name: string;
};

export type AiMenuModifierOption = {
  name: string;
  priceDelta: number;
  displayOrder: number;
};

export type AiMenuModifierGroup = {
  name: string;
  required: boolean;
  multiSelect: boolean;
  displayOrder: number;
  options: AiMenuModifierOption[];
};

export type AiMenuProduct = {
  name: string;
  category: string;
  price: number;
  description?: string;
  active: boolean;
  modifierGroups: AiMenuModifierGroup[];
};

export type AiGeneratedMenu = {
  categories: AiMenuCategory[];
  products: AiMenuProduct[];
  provider: 'deepseek' | 'mock';
  model: string;
};

export type AiMenuImportSummary = {
  created: number;
  skipped: number;
};
