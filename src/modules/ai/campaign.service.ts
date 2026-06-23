import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { toMoneyNumber } from '@/common/utils/money';
import { PrismaService } from '@/prisma/prisma.service';

import type { AiCampaignSalesSummary, AiGeneratedCampaign } from './ai-campaign.types';
import { DeepSeekMenuService } from './deepseek-menu.service';
import { GenerateCampaignDto } from './dto/generate-campaign.dto';

@Injectable()
export class AiCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepSeekMenuService: DeepSeekMenuService,
  ) {}

  async generateCampaign(dto: GenerateCampaignDto) {
    const salesSummary = await this.getSalesSummary();
    const prompt = this.createCampaignPrompt(dto, salesSummary);

    try {
      const deepSeekResult = await this.deepSeekMenuService.completeJson([
        {
          role: 'system',
          content:
            'You generate POS growth campaign drafts as strict JSON only. Do not execute campaigns. Do not change product prices. No markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);
      if (deepSeekResult?.content) {
        const parsed = this.parseJsonObject(deepSeekResult.content);
        const campaign = this.normalizeCampaign(parsed, salesSummary, 'deepseek', deepSeekResult.model);
        const draft = await this.prisma.aiDraft.create({
          data: {
            prompt,
            structuredJson: {
              draftType: 'campaign',
              campaign,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        return {
          draftId: draft.id,
          campaign,
          source: 'deepseek',
        };
      }
    } catch {
      // Keep local demo usable when provider output or connectivity is unavailable.
    }

    const campaign = this.createMockCampaign(dto, salesSummary);
    const draft = await this.prisma.aiDraft.create({
      data: {
        prompt,
        structuredJson: {
          draftType: 'campaign',
          campaign,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      draftId: draft.id,
      campaign,
      source: 'mock',
    };
  }

  private async getSalesSummary(): Promise<AiCampaignSalesSummary> {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAID,
        paidAt: { gte: since },
      },
      include: {
        items: { include: { product: true } },
        payments: true,
      },
      orderBy: { paidAt: 'desc' },
      take: 100,
    });

    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    const paymentMap = new Map<string, number>();
    let totalRevenue = 0;

    for (const order of orders) {
      totalRevenue += toMoneyNumber(order.total);
      for (const payment of order.payments) {
        paymentMap.set(payment.method, toMoneyNumber((paymentMap.get(payment.method) ?? 0) + toMoneyNumber(payment.amount)));
      }
      for (const item of order.items) {
        const existing = productMap.get(item.product.name) ?? { name: item.product.name, quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue = toMoneyNumber(existing.revenue + toMoneyNumber(item.lineTotal));
        productMap.set(item.product.name, existing);
      }
    }

    const products = Array.from(productMap.values());
    const topProducts = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const lowPerformingProducts = [...products].sort((a, b) => a.revenue - b.revenue).slice(0, 5);

    return {
      totalOrders: orders.length,
      totalRevenue: toMoneyNumber(totalRevenue),
      topProducts,
      lowPerformingProducts,
      paymentBreakdown: Array.from(paymentMap.entries()).map(([method, amount]) => ({
        method,
        amount: toMoneyNumber(amount),
      })),
    };
  }

  private createCampaignPrompt(dto: GenerateCampaignDto, salesSummary: AiCampaignSalesSummary) {
    return [
      'Create a lightweight POS campaign draft for a small merchant.',
      'Return JSON shape: {"campaignName":"Afternoon Chill Promo","goal":"Increase afternoon sales","targetProducts":["Cold Brew"],"discountType":"percentage","discountValue":20,"timeWindow":"2pm-5pm","bannerCopy":"...","staffMessage":"...","executionNotes":["..."]}.',
      'Rules: structured JSON only, no markdown, no direct execution, no automatic price changes, targetProducts should prefer products from sales summary when possible.',
      `Campaign goal: ${dto.goal?.trim() || 'increase sales'}`,
      `Time window: ${dto.timeWindow?.trim() || 'merchant selected window'}`,
      `Focus category: ${dto.focusCategory?.trim() || 'best fit from sales data'}`,
      `Extra notes: ${dto.notes?.trim() || 'simple, low-risk campaign'}`,
      `Sales summary: ${JSON.stringify(salesSummary)}`,
    ].join('\n');
  }

  private parseJsonObject(content: string) {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
  }

  private normalizeCampaign(
    value: unknown,
    salesSummary: AiCampaignSalesSummary,
    provider: AiGeneratedCampaign['provider'],
    model: string,
  ): AiGeneratedCampaign {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('AI campaign JSON is invalid.');
    }

    const candidate = value as Partial<AiGeneratedCampaign>;
    const campaignName = this.requiredText(candidate.campaignName, 'campaignName');
    const goal = this.requiredText(candidate.goal, 'goal');
    const targetProducts = Array.isArray(candidate.targetProducts)
      ? candidate.targetProducts.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : [];
    const discountValue = Number(candidate.discountValue ?? 0);
    const executionNotes = Array.isArray(candidate.executionNotes)
      ? candidate.executionNotes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : [];

    if (targetProducts.length === 0 || executionNotes.length === 0) {
      throw new BadRequestException('AI campaign is missing target products or execution notes.');
    }

    return {
      campaignName,
      goal,
      targetProducts: targetProducts.slice(0, 8),
      discountType: this.normalizeDiscountType(candidate.discountType),
      discountValue: Number((Number.isFinite(discountValue) ? Math.max(discountValue, 0) : 0).toFixed(2)),
      timeWindow: this.requiredText(candidate.timeWindow, 'timeWindow'),
      bannerCopy: this.requiredText(candidate.bannerCopy, 'bannerCopy'),
      staffMessage: this.requiredText(candidate.staffMessage, 'staffMessage'),
      executionNotes: executionNotes.slice(0, 6),
      salesSummary,
      provider,
      model,
    };
  }

  private requiredText(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`AI campaign is missing ${field}.`);
    }
    return value.trim();
  }

  private normalizeDiscountType(value: unknown): AiGeneratedCampaign['discountType'] {
    if (value === 'percentage' || value === 'fixed_amount' || value === 'bundle' || value === 'staff_prompt') {
      return value;
    }
    return 'staff_prompt';
  }

  private createMockCampaign(dto: GenerateCampaignDto, salesSummary: AiCampaignSalesSummary): AiGeneratedCampaign {
    const topProduct = salesSummary.topProducts[0]?.name ?? dto.focusCategory?.trim() ?? 'Cold Brew';
    const secondProduct = salesSummary.topProducts[1]?.name ?? 'Iced Latte';
    const goal = dto.goal?.trim() || 'Increase afternoon sales';
    const timeWindow = dto.timeWindow?.trim() || '2pm-5pm';

    return {
      campaignName: dto.focusCategory?.toLowerCase().includes('tea') ? 'Tea Time Lift' : 'Afternoon Chill Promo',
      goal,
      targetProducts: [topProduct, secondProduct],
      discountType: 'percentage',
      discountValue: 15,
      timeWindow,
      bannerCopy: 'Make the slow hours feel easy with a fresh counter deal.',
      staffMessage: `Recommend ${topProduct} during ${timeWindow} and mention the limited-time offer.`,
      executionNotes: [
        'Show the campaign message near the counter.',
        'Ask staff to suggest the target products during the selected time window.',
        'Review order history after one week before changing pricing permanently.',
      ],
      salesSummary,
      provider: 'mock',
      model: 'local-deterministic-campaign',
    };
  }
}
