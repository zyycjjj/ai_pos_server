import type { Product } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';

export function presentProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: toMoneyNumber(product.price),
    currency: product.currency,
    isActive: product.isActive,
  };
}

