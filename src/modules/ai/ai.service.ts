import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiDraftStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import { presentAiDraft } from './ai-draft.presenter';
import { ConfirmMenuDraftDto } from './dto/confirm-menu-draft.dto';
import { CreateMenuDraftDto } from './dto/create-menu-draft.dto';

type DraftMenuItem = {
  name: string;
  category: string;
  price: number;
  currency: string;
};

type DraftMenu = {
  currency: string;
  items: DraftMenuItem[];
  source: 'local-mvp-generator';
};

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async listDrafts() {
    const drafts = await this.prisma.aiDraft.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return drafts.map(presentAiDraft);
  }

  async createMenuDraft(dto: CreateMenuDraftDto) {
    const structuredJson = this.generateLocalMenuDraft(dto.prompt, dto.currency ?? 'USD');
    const draft = await this.prisma.aiDraft.create({
      data: {
        prompt: dto.prompt,
        structuredJson: structuredJson as unknown as Prisma.InputJsonValue,
      },
    });

    return presentAiDraft(draft);
  }

  async confirmMenuDraft(id: string, dto: ConfirmMenuDraftDto) {
    const draft = await this.prisma.aiDraft.findUnique({ where: { id } });
    if (!draft) {
      throw new NotFoundException('AI draft not found.');
    }
    if (draft.status !== AiDraftStatus.DRAFT) {
      throw new BadRequestException('Only draft AI menus can be confirmed.');
    }

    const menu = this.parseDraftMenu(draft.structuredJson);
    const productNames = menu.items.map((item) => item.name);
    const existing = await this.prisma.product.findMany({
      where: { name: { in: productNames } },
    });
    const existingByName = new Map(existing.map((product) => [product.name.toLowerCase(), product]));

    const result = await this.prisma.$transaction(async (tx) => {
      const products = [];

      for (const item of menu.items) {
        const existingProduct = existingByName.get(item.name.toLowerCase());
        if (existingProduct?.isActive) {
          products.push(existingProduct);
          continue;
        }

        if (existingProduct && dto.restoreInactiveDuplicates) {
          const restored = await tx.product.update({
            where: { id: existingProduct.id },
            data: {
              category: item.category,
              price: item.price,
              currency: item.currency,
              isActive: true,
            },
          });
          products.push(restored);
          continue;
        }

        const created = await tx.product.create({
          data: {
            name: item.name,
            category: item.category,
            price: item.price,
            currency: item.currency,
          },
        });
        products.push(created);
      }

      const confirmed = await tx.aiDraft.update({
        where: { id },
        data: {
          status: AiDraftStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });

      return {
        draft: confirmed,
        products,
      };
    });

    return {
      draft: presentAiDraft(result.draft),
      products: result.products.map((product) => ({
        ...product,
        price: Number(product.price.toFixed(2)),
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      })),
    };
  }

  async discardDraft(id: string) {
    const draft = await this.prisma.aiDraft.findUnique({ where: { id } });
    if (!draft) {
      throw new NotFoundException('AI draft not found.');
    }
    if (draft.status !== AiDraftStatus.DRAFT) {
      throw new BadRequestException('Only draft AI menus can be discarded.');
    }

    const updated = await this.prisma.aiDraft.update({
      where: { id },
      data: { status: AiDraftStatus.DISCARDED },
    });

    return presentAiDraft(updated);
  }

  private generateLocalMenuDraft(prompt: string, currency: string): DraftMenu {
    const normalized = prompt.toLowerCase();
    const coffeeItems: DraftMenuItem[] = [
      { name: 'Espresso', category: 'Coffee', price: 3.5, currency },
      { name: 'Latte', category: 'Coffee', price: 5, currency },
      { name: 'Cold Brew', category: 'Coffee', price: 5.5, currency },
      { name: 'Seasonal Iced Tea', category: 'Tea', price: 4.75, currency },
      { name: 'Croissant', category: 'Bakery', price: 4.25, currency },
    ];
    const retailItems: DraftMenuItem[] = [
      { name: 'Classic Tote', category: 'Merch', price: 18, currency },
      { name: 'Sticker Pack', category: 'Merch', price: 6, currency },
      { name: 'Gift Card', category: 'Gift Cards', price: 25, currency },
    ];

    const items = normalized.includes('retail') || normalized.includes('popup') ? retailItems : coffeeItems;

    return {
      currency,
      items,
      source: 'local-mvp-generator',
    };
  }

  private parseDraftMenu(value: unknown): DraftMenu {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('AI draft structured JSON is invalid.');
    }

    const candidate = value as Partial<DraftMenu>;
    if (!Array.isArray(candidate.items) || candidate.items.length === 0) {
      throw new BadRequestException('AI draft does not contain menu items.');
    }

    return {
      currency: typeof candidate.currency === 'string' ? candidate.currency : 'USD',
      source: 'local-mvp-generator',
      items: candidate.items.map((item) => this.parseDraftMenuItem(item, candidate.currency ?? 'USD')),
    };
  }

  private parseDraftMenuItem(value: unknown, fallbackCurrency: string): DraftMenuItem {
    const item = value as Partial<DraftMenuItem>;
    if (!item.name || !item.category || typeof item.price !== 'number') {
      throw new BadRequestException('AI draft menu item is missing name, category, or price.');
    }

    return {
      name: item.name.trim(),
      category: item.category.trim(),
      price: item.price,
      currency: item.currency ?? fallbackCurrency,
    };
  }
}
