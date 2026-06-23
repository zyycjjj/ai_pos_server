import type { Prisma } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';

type ProductWithModifiers = Prisma.ProductGetPayload<{
  include: {
    modifierGroups: {
      include: {
        options: true;
      };
    };
  };
}>;

export function presentProduct(product: ProductWithModifiers) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: toMoneyNumber(product.price),
    currency: product.currency,
    isActive: product.isActive,
    modifierGroups: product.modifierGroups.map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      multiSelect: group.multiSelect,
      displayOrder: group.displayOrder,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: toMoneyNumber(option.priceDelta),
        displayOrder: option.displayOrder,
      })),
    })),
  };
}
