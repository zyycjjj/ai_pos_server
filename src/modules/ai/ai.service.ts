import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiDraftStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';

import { presentAiDraft } from './ai-draft.presenter';
import type { AiGeneratedMenu, AiMenuModifierGroup, AiMenuProduct } from './ai-menu.types';
import { DeepSeekMenuService } from './deepseek-menu.service';
import { ConfirmMenuDraftDto } from './dto/confirm-menu-draft.dto';
import { CreateMenuDraftDto } from './dto/create-menu-draft.dto';
import { GenerateMenuDto } from './dto/generate-menu.dto';
import { ImportMenuDto } from './dto/import-menu.dto';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepSeekMenuService: DeepSeekMenuService,
  ) {}

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

  async generateMenu(dto: GenerateMenuDto) {
    const prompt = this.createMenuPrompt(dto);

    try {
      const deepSeekResult = await this.deepSeekMenuService.generate(dto);
      if (deepSeekResult?.content) {
        const parsed = this.parseJsonObject(deepSeekResult.content);
        const menu = this.normalizeGeneratedMenu(parsed, 'deepseek', deepSeekResult.model);
        const draft = await this.prisma.aiDraft.create({
          data: {
            prompt,
            structuredJson: menu as unknown as Prisma.InputJsonValue,
          },
        });
        return {
          draftId: draft.id,
          menu,
          source: 'deepseek' as const,
        };
      }
    } catch {
      // Fall through to deterministic local menu so local POS preview remains usable.
    }

    const menu = this.createMockGeneratedMenu(dto);
    const draft = await this.prisma.aiDraft.create({
      data: {
        prompt,
        structuredJson: menu as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      draftId: draft.id,
      menu,
      source: 'mock' as const,
    };
  }

  async importMenu(dto: ImportMenuDto) {
    const menu = this.normalizeGeneratedMenu(dto.menu, 'mock', process.env.DEEPSEEK_MODEL ?? 'deepseek-chat');
    const names = menu.products.map((product) => product.name);
    const existing = await this.prisma.product.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    const existingNames = new Set(existing.map((product) => product.name.toLowerCase()));

    const result = await this.prisma.$transaction(
      async (tx) => {
        let created = 0;
        let skipped = 0;
        const products = [];

        for (const product of menu.products) {
          if (existingNames.has(product.name.toLowerCase())) {
            skipped += 1;
            continue;
          }

          const createdProduct = await tx.product.create({
            data: {
              name: product.name,
              category: product.category,
              price: product.price,
              currency: 'USD',
              isActive: product.active,
              modifierGroups: {
                create: product.modifierGroups.map((group) => ({
                  name: group.name,
                  required: group.required,
                  multiSelect: group.multiSelect,
                  displayOrder: group.displayOrder,
                  options: {
                    create: group.options.map((option) => ({
                      name: option.name,
                      priceDelta: option.priceDelta,
                      displayOrder: option.displayOrder,
                    })),
                  },
                })),
              },
            },
            include: {
              modifierGroups: {
                include: { options: true },
                orderBy: { displayOrder: 'asc' },
              },
            },
          });
          created += 1;
          existingNames.add(product.name.toLowerCase());
          products.push(createdProduct);
        }

        return { created, skipped, products };
      },
      { timeout: 15_000 },
    );

    return {
      summary: {
        created: result.created,
        skipped: result.skipped,
      },
      products: result.products.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        price: Number(product.price.toFixed(2)),
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
            priceDelta: Number(option.priceDelta.toFixed(2)),
            displayOrder: option.displayOrder,
          })),
        })),
      })),
    };
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

    const result = await this.prisma.$transaction(
      async (tx) => {
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
      },
      { timeout: 15_000 },
    );

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

  private createMenuPrompt(dto: GenerateMenuDto) {
    return [
      dto.businessType?.trim(),
      dto.cuisine?.trim(),
      dto.priceRange?.trim(),
      dto.brandTone?.trim(),
      dto.notes?.trim(),
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private parseJsonObject(content: string) {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
  }

  private normalizeGeneratedMenu(value: unknown, provider: AiGeneratedMenu['provider'], model: string): AiGeneratedMenu {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('AI menu JSON is invalid.');
    }

    const candidate = value as Partial<AiGeneratedMenu>;
    const productsValue = Array.isArray(candidate.products) ? candidate.products : [];
    if (productsValue.length < 1) {
      throw new BadRequestException('AI menu must include products.');
    }

    const rawCategoryNames = Array.isArray(candidate.categories)
      ? candidate.categories
          .map((category) => (category as { name?: unknown }).name)
          .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [];

    const categories = new Set(rawCategoryNames.map((name) => name.trim()));
    const products = productsValue.slice(0, 20).map((product, index) => this.normalizeProduct(product, index));

    for (const product of products) {
      categories.add(product.category);
    }

    if (products.length < 6) {
      throw new BadRequestException('AI menu must include at least 6 products.');
    }

    return {
      categories: Array.from(categories).map((name) => ({ name })),
      products,
      provider,
      model,
    };
  }

  private normalizeProduct(value: unknown, index: number): AiMenuProduct {
    const product = value as Partial<AiMenuProduct>;
    const name = typeof product.name === 'string' ? product.name.trim() : '';
    const category = typeof product.category === 'string' ? product.category.trim() : '';
    const price = Number(product.price);

    if (!name || !category || !Number.isFinite(price) || price < 0) {
      throw new BadRequestException(`AI menu product ${index + 1} is missing name, category, or price.`);
    }

    return {
      name,
      category,
      price: Number(price.toFixed(2)),
      description: typeof product.description === 'string' ? product.description.trim() : undefined,
      active: product.active !== false,
      modifierGroups: Array.isArray(product.modifierGroups)
        ? product.modifierGroups.map((group, groupIndex) => this.normalizeModifierGroup(group, groupIndex))
        : [],
    };
  }

  private normalizeModifierGroup(value: unknown, index: number): AiMenuModifierGroup {
    const group = value as Partial<AiMenuModifierGroup>;
    const name = typeof group.name === 'string' ? group.name.trim() : '';
    const options = Array.isArray(group.options)
      ? group.options
          .map((option, optionIndex) => {
            const candidate = option as { name?: unknown; priceDelta?: unknown; displayOrder?: unknown };
            const optionName = typeof candidate.name === 'string' ? candidate.name.trim() : '';
            if (!optionName) {
              return null;
            }
            const priceDelta = Number(candidate.priceDelta ?? 0);
            return {
              name: optionName,
              priceDelta: Number((Number.isFinite(priceDelta) ? priceDelta : 0).toFixed(2)),
              displayOrder: Number(candidate.displayOrder ?? optionIndex + 1),
            };
          })
          .filter((option): option is { name: string; priceDelta: number; displayOrder: number } => Boolean(option))
      : [];

    if (!name || options.length === 0) {
      throw new BadRequestException(`AI menu modifier group ${index + 1} is invalid.`);
    }

    return {
      name,
      required: Boolean(group.required),
      multiSelect: Boolean(group.multiSelect),
      displayOrder: Number(group.displayOrder ?? index + 1),
      options,
    };
  }

  private createMockGeneratedMenu(dto: GenerateMenuDto): AiGeneratedMenu {
    const isTea = `${dto.cuisine ?? ''} ${dto.notes ?? ''}`.toLowerCase().includes('tea');
    const categories = isTea ? [{ name: 'Milk Tea' }, { name: 'Coffee' }, { name: 'Bakery' }] : [{ name: 'Coffee' }, { name: 'Tea' }, { name: 'Bakery' }];
    const modifierGroups: AiMenuModifierGroup[] = [
      {
        name: 'Ice Level',
        required: true,
        multiSelect: false,
        displayOrder: 1,
        options: [
          { name: 'No Ice', priceDelta: 0, displayOrder: 1 },
          { name: 'Normal Ice', priceDelta: 0, displayOrder: 2 },
          { name: 'Hot', priceDelta: 0, displayOrder: 3 },
        ],
      },
      {
        name: 'Sweetness',
        required: true,
        multiSelect: false,
        displayOrder: 2,
        options: [
          { name: '0%', priceDelta: 0, displayOrder: 1 },
          { name: '70%', priceDelta: 0, displayOrder: 2 },
          { name: '100%', priceDelta: 0, displayOrder: 3 },
        ],
      },
      {
        name: 'Toppings',
        required: false,
        multiSelect: true,
        displayOrder: 3,
        options: [
          { name: 'Pearl', priceDelta: 0.75, displayOrder: 1 },
          { name: 'Pudding', priceDelta: 1, displayOrder: 2 },
        ],
      },
    ];
    const products: AiMenuProduct[] = isTea
      ? [
          { name: 'Classic Milk Tea', category: 'Milk Tea', price: 5.75, description: 'Black tea with creamy milk.', active: true, modifierGroups },
          { name: 'Brown Sugar Pearl Milk', category: 'Milk Tea', price: 6.5, description: 'Brown sugar syrup with pearls.', active: true, modifierGroups },
          { name: 'Jasmine Green Tea', category: 'Milk Tea', price: 4.75, active: true, modifierGroups: modifierGroups.slice(0, 2) },
          { name: 'Americano', category: 'Coffee', price: 4, active: true, modifierGroups: [] },
          { name: 'Oat Latte', category: 'Coffee', price: 5.5, active: true, modifierGroups: [] },
          { name: 'Butter Croissant', category: 'Bakery', price: 4.25, active: true, modifierGroups: [] },
        ]
      : [
          { name: 'Espresso', category: 'Coffee', price: 3.5, active: true, modifierGroups: [] },
          { name: 'Latte', category: 'Coffee', price: 5.25, description: 'Smooth espresso and steamed milk.', active: true, modifierGroups: [] },
          { name: 'Cold Brew', category: 'Coffee', price: 5.75, active: true, modifierGroups: [] },
          { name: 'Seasonal Iced Tea', category: 'Tea', price: 4.75, active: true, modifierGroups: modifierGroups.slice(0, 2) },
          { name: 'Matcha Latte', category: 'Tea', price: 5.95, active: true, modifierGroups },
          { name: 'Croissant', category: 'Bakery', price: 4.25, active: true, modifierGroups: [] },
        ];

    return {
      categories,
      products,
      provider: 'mock',
      model: 'local-deterministic-menu',
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
