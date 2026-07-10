export type AiContextSource = 'analytics' | 'catalog' | 'orders' | 'shifts' | 'kitchen' | 'printing';

export type AiBoundedContext<T = unknown> = {
  source: AiContextSource;
  storeId: string;
  generatedAt: string;
  data: T;
  coverage?: string;
};

