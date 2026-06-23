import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Decimal } from '@prisma/client/runtime/library';

import { AiCampaignService } from './campaign.service';

describe('AiCampaignService', () => {
  it('generates a mock campaign draft when DeepSeek is unavailable', async () => {
    const createdAt = new Date('2026-06-23T00:00:00.000Z');
    const prisma = {
      order: {
        findMany: async () => [
          {
            id: 'order-1',
            total: new Decimal('18.50'),
            items: [
              {
                quantity: 2,
                lineTotal: new Decimal('11.50'),
                product: { name: 'Cold Brew' },
              },
              {
                quantity: 1,
                lineTotal: new Decimal('7.00'),
                product: { name: 'Croissant' },
              },
            ],
            payments: [{ method: 'CARD', amount: new Decimal('18.50') }],
          },
        ],
      },
      aiDraft: {
        create: async ({ data }: any) => ({
          id: 'campaign-draft-1',
          prompt: data.prompt,
          structuredJson: data.structuredJson,
          status: 'DRAFT',
          createdAt,
          updatedAt: createdAt,
          confirmedAt: null,
        }),
      },
    };
    const deepSeek = {
      completeJson: async () => null,
    };
    const service = new AiCampaignService(prisma as any, deepSeek as any);

    const result = await service.generateCampaign({
      goal: 'Increase afternoon sales',
      timeWindow: '2pm-5pm',
      focusCategory: 'Coffee',
    });

    assert.equal(result.source, 'mock');
    assert.equal(result.campaign.provider, 'mock');
    assert.equal(result.campaign.salesSummary.totalOrders, 1);
    assert.deepEqual(result.campaign.targetProducts.slice(0, 1), ['Cold Brew']);
    assert.equal(result.campaign.discountType, 'percentage');
  });
});
