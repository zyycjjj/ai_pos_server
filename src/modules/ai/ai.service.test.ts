import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AiService } from './ai.service';

describe('AiService menu generation', () => {
  it('uses deterministic mock generation when DeepSeek is unavailable', async () => {
    const prisma = {
      aiDraft: {
        create: async ({ data }: any) => ({
          id: 'draft-1',
          prompt: data.prompt,
          structuredJson: data.structuredJson,
          status: 'DRAFT',
          createdAt: new Date('2026-06-23T00:00:00.000Z'),
          updatedAt: new Date('2026-06-23T00:00:00.000Z'),
          confirmedAt: null,
        }),
      },
    };
    const deepSeek = {
      generate: async () => null,
    };
    const service = new AiService(prisma as any, deepSeek as any);

    const result = await service.generateMenu({
      businessType: 'Tea shop',
      cuisine: 'milk tea',
      notes: 'include modifiers',
    });

    assert.equal(result.source, 'mock');
    assert.equal(result.menu.products.length >= 6, true);
    assert.equal(result.menu.products.some((product) => product.modifierGroups.length > 0), true);
  });

  it('skips duplicated product names during import', async () => {
    const createdProducts: any[] = [];
    const prisma = {
      product: {
        findMany: async () => [{ id: 'existing', name: 'Espresso' }],
      },
      category: {
        findMany: async () => [],
        create: async ({ data }: any) => ({
          id: `category-${data.name}`,
          createdAt: new Date('2026-06-23T00:00:00.000Z'),
          updatedAt: new Date('2026-06-23T00:00:00.000Z'),
          ...data,
        }),
      },
      $transaction: async (callback: any) => callback(prisma),
      productCreateCalls: createdProducts,
    };
    (prisma as any).product.create = async ({ data }: any) => {
      const product = {
        id: `product-${createdProducts.length + 1}`,
        createdAt: new Date('2026-06-23T00:00:00.000Z'),
        updatedAt: new Date('2026-06-23T00:00:00.000Z'),
        ...data,
        price: { toFixed: () => Number(data.price).toFixed(2) },
        modifierGroups: [],
      };
      createdProducts.push(product);
      return product;
    };
    const service = new AiService(prisma as any, { generate: async () => null } as any);

    const result = await service.importMenu({
      menu: {
        categories: [{ name: 'Coffee' }],
        products: [
          { name: 'Espresso', category: 'Coffee', price: 3.5, active: true, modifierGroups: [] },
          { name: 'Latte', category: 'Coffee', price: 5, active: true, modifierGroups: [] },
          { name: 'Cold Brew', category: 'Coffee', price: 5.5, active: true, modifierGroups: [] },
          { name: 'Americano', category: 'Coffee', price: 4, active: true, modifierGroups: [] },
          { name: 'Mocha', category: 'Coffee', price: 5.75, active: true, modifierGroups: [] },
          { name: 'Cappuccino', category: 'Coffee', price: 5.25, active: true, modifierGroups: [] },
        ],
      },
    });

    assert.equal(result.summary.created, 5);
    assert.equal(result.summary.skipped, 1);
  });
});
