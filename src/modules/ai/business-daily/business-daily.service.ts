import { BadRequestException, Injectable } from '@nestjs/common';
import { CampaignStatus, CampaignType, CustomerEligibilityMode, PromotionStackingPolicy } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { DeepSeekProvider } from '@/modules/ai/providers/deepseek.provider';

import { BusinessDailyFallback } from './business-daily-fallback';
import { buildBusinessDailyPrompt } from './business-daily-prompt';
import { BusinessDailyRepository } from './business-daily.repository';
import type { CreateCampaignDraftFromRecommendationDto, BusinessDailyQueryDto } from './dto/business-daily.dto';
import type { BusinessDailyCampaignTemplate, BusinessDailyRecommendation, BusinessDailyReport, BusinessDailyRange } from './business-daily.types';

@Injectable()
export class BusinessDailyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContextService,
    private readonly repository: BusinessDailyRepository,
    private readonly fallback: BusinessDailyFallback,
    private readonly deepSeek: DeepSeekProvider,
  ) {}

  async getBusinessDaily(query: BusinessDailyQueryDto, currentUser: AuthRequestUser): Promise<BusinessDailyReport> {
    const range = resolveBusinessDailyRange(query);
    const raw = await this.repository.load(this.storeContext.getStoreId(), range);
    const baseline = this.fallback.generate(range, raw, { generatedBy: 'deterministic-fallback', providerLabel: 'fallback', fallback: true });
    if (process.env.AI_POS_AI_DAILY_FORCE_FALLBACK === 'true') return baseline;

    try {
      const prompt = buildBusinessDailyPrompt(baseline);
      const response = await this.deepSeek.generateStructuredResponse({ ...prompt, timeoutMs: 10_000 });
      if (!response?.content) return baseline;
      const parsed = JSON.parse(response.content) as Partial<BusinessDailyReport>;
      return this.mergeProviderReport(baseline, parsed, response.provider, currentUser);
    } catch {
      return baseline;
    }
  }

  async getRecommendations(query: BusinessDailyQueryDto, currentUser: AuthRequestUser) {
    const report = await this.getBusinessDaily(query, currentUser);
    return report.recommendations;
  }

  async createCampaignDraft(dto: CreateCampaignDraftFromRecommendationDto, currentUser: AuthRequestUser) {
    const template = dto.campaignTemplate ?? this.defaultTemplate(dto.type ?? 'CAMPAIGN');
    const spec = campaignSpec(template, dto);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const endsAt = new Date(tomorrow);
    endsAt.setDate(endsAt.getDate() + 7);

    const campaign = await this.prisma.campaign.create({
      data: {
        storeId: this.storeContext.getStoreId(),
        name: spec.name,
        goal: spec.goal,
        status: CampaignStatus.DRAFT,
        type: spec.type,
        discountType: spec.discountType,
        discountValue: spec.discountValue,
        thresholdAmount: spec.thresholdAmount,
        promoCode: spec.promoCode,
        categoryName: spec.categoryName,
        customerEligibilityMode: spec.customerEligibilityMode,
        stackingPolicy: PromotionStackingPolicy.BEST_ONLY,
        startsAt: tomorrow,
        endsAt,
        usageLimit: spec.usageLimit,
        bannerCopy: spec.bannerCopy,
        staffMessage: spec.staffMessage,
        createdById: currentUser.id,
        structuredJson: {
          source: 'ai_business_daily',
          recommendationId: dto.recommendationId,
          recommendationType: dto.type,
          campaignTemplate: template,
          recommendationReason: dto.reason,
        } satisfies Prisma.InputJsonObject,
      },
    });
    return this.presentCampaign(campaign);
  }

  private mergeProviderReport(baseline: BusinessDailyReport, parsed: Partial<BusinessDailyReport>, provider: string, currentUser: AuthRequestUser): BusinessDailyReport {
    const evidenceIds = new Set(baseline.evidence.map((item) => item.id));
    const cleanSection = (section: unknown, fallback: BusinessDailyReport['summary']) => {
      const candidate = section as { text?: unknown; evidenceIds?: unknown };
      const ids = Array.isArray(candidate?.evidenceIds) ? candidate.evidenceIds.filter((id): id is string => typeof id === 'string' && evidenceIds.has(id)) : [];
      return typeof candidate?.text === 'string' && ids.length > 0 ? { text: candidate.text, evidenceIds: ids } : fallback;
    };
    const cleanSections = (sections: unknown, fallbacks: BusinessDailyReport['highlights']) => {
      if (!Array.isArray(sections)) return fallbacks;
      const cleaned = sections.map((section, index) => cleanSection(section, fallbacks[index] ?? baseline.summary)).filter((section) => section.evidenceIds.length > 0);
      return cleaned.length > 0 ? cleaned.slice(0, 6) : fallbacks;
    };
    const cleanRecommendations = (recommendations: unknown): BusinessDailyRecommendation[] => {
      if (!Array.isArray(recommendations)) return baseline.recommendations;
      const cleaned = recommendations.map((item, index) => {
        const candidate = item as Partial<BusinessDailyRecommendation>;
        const ids = Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds.filter((id): id is string => typeof id === 'string' && evidenceIds.has(id)) : [];
        if (!candidate.title || !candidate.reason || ids.length === 0) return baseline.recommendations[index];
        return {
          id: candidate.id || baseline.recommendations[index]?.id || `ai_rec_${index + 1}`,
          type: candidate.type || baseline.recommendations[index]?.type || 'SALES',
          priority: candidate.priority || baseline.recommendations[index]?.priority || 'LOW',
          title: candidate.title,
          reason: candidate.reason,
          evidenceIds: ids,
          action: candidate.action ?? baseline.recommendations[index]?.action ?? { kind: 'NONE', label: 'Review' },
        } as BusinessDailyRecommendation;
      }).filter(Boolean) as BusinessDailyRecommendation[];
      return cleaned.length > 0 ? cleaned.slice(0, 8) : baseline.recommendations;
    };

    return {
      ...baseline,
      summary: cleanSection(parsed.summary, baseline.summary),
      highlights: cleanSections(parsed.highlights, baseline.highlights),
      risks: cleanSections(parsed.risks, baseline.risks),
      recommendations: cleanRecommendations(parsed.recommendations),
      generatedBy: `${provider}:${currentUser.role}`,
      fallback: false,
      generatedAt: new Date().toISOString(),
    };
  }

  private defaultTemplate(type: string): BusinessDailyCampaignTemplate {
    if (type === 'CUSTOMER') return 'CUSTOMER_REACTIVATION';
    if (type === 'PRODUCT') return 'LOW_SELLING_PRODUCT_PROMO';
    return 'THRESHOLD_DISCOUNT';
  }

  private presentCampaign(campaign: Awaited<ReturnType<PrismaService['campaign']['create']>>) {
    return {
      id: campaign.id,
      name: campaign.name,
      goal: campaign.goal,
      type: campaign.type,
      discountType: campaign.discountType,
      discountValue: campaign.discountValue,
      thresholdAmount: campaign.thresholdAmount ? Number(campaign.thresholdAmount) : null,
      promoCode: campaign.promoCode,
      status: campaign.status,
      startsAt: campaign.startsAt?.toISOString() ?? null,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      usageLimit: campaign.usageLimit,
      customerEligibilityMode: campaign.customerEligibilityMode,
      createdAt: campaign.createdAt.toISOString(),
    };
  }
}

export function resolveBusinessDailyRange(query: BusinessDailyQueryDto = {}): BusinessDailyRange {
  const timezone = query.timezone ?? 'Asia/Shanghai';
  if (timezone !== 'Asia/Shanghai') throw new BadRequestException('AI Daily currently supports timezone Asia/Shanghai.');
  const preset = query.preset ?? (query.from || query.to ? 'custom' : 'today');
  const today = localDate(new Date());
  const range = preset === 'custom' ? customRange(query) : presetRange(preset, today);
  return { ...range, timezone, preset, start: localStartToUtc(range.from), end: localEndToUtc(range.to) };
}

function customRange(query: BusinessDailyQueryDto) {
  if (!query.from || !query.to) throw new BadRequestException('Custom AI Daily requires from and to.');
  const from = normalizeDate(query.from);
  const to = normalizeDate(query.to);
  if (localStartToUtc(from) > localEndToUtc(to)) throw new BadRequestException('AI Daily from must be before to.');
  return { from, to };
}

function presetRange(preset: BusinessDailyQueryDto['preset'], today: string) {
  const date = parseDate(today);
  if (!preset || preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const value = addDays(date, -1);
    return { from: formatDate(value), to: formatDate(value) };
  }
  if (preset === 'last7days') return { from: formatDate(addDays(date, -6)), to: today };
  throw new BadRequestException('Unsupported AI Daily preset.');
}

function normalizeDate(input: string) {
  const value = input.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('AI Daily dates must use YYYY-MM-DD.');
  return value;
}

function localStartToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

function localEndToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 8 * 60 * 60 * 1000);
}

function localDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function parseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function campaignSpec(template: BusinessDailyCampaignTemplate, dto: CreateCampaignDraftFromRecommendationDto) {
  const baseName = (dto.title ?? dto.recommendationId).slice(0, 80);
  const goal = dto.reason ?? 'AI recommended campaign draft.';
  if (template === 'LOW_SELLING_PRODUCT_PROMO') {
    return { name: `${baseName} Draft`, goal, type: CampaignType.ITEM_DISCOUNT, discountType: 'percentage', discountValue: 15, categoryName: null, thresholdAmount: null, promoCode: null, usageLimit: null, customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS, bannerCopy: 'Try today’s featured item.', staffMessage: 'Offer this promo when guests are choosing.' };
  }
  if (template === 'CUSTOMER_REACTIVATION') {
    return { name: `${baseName} Draft`, goal, type: CampaignType.PROMO_CODE, discountType: 'percentage', discountValue: 15, categoryName: null, thresholdAmount: null, promoCode: `BACK${Date.now().toString().slice(-4)}`, usageLimit: null, customerEligibilityMode: CustomerEligibilityMode.CUSTOMER_ONLY, bannerCopy: 'Welcome back offer.', staffMessage: 'Use only after manager review.' };
  }
  if (template === 'TOP_CUSTOMER_REWARD') {
    return { name: `${baseName} Draft`, goal, type: CampaignType.PROMO_CODE, discountType: 'percentage', discountValue: 10, categoryName: null, thresholdAmount: null, promoCode: `VIP${Date.now().toString().slice(-4)}`, usageLimit: null, customerEligibilityMode: CustomerEligibilityMode.CUSTOMER_ONLY, bannerCopy: 'A small thank-you for loyal guests.', staffMessage: 'Confirm eligibility before sharing.' };
  }
  if (template === 'LUNCH_TIME_PROMO') {
    return { name: `${baseName} Draft`, goal, type: CampaignType.ORDER_DISCOUNT, discountType: 'percentage', discountValue: 10, categoryName: null, thresholdAmount: null, promoCode: null, usageLimit: null, customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS, bannerCopy: 'Lunch time special.', staffMessage: 'Use during lunch window after approval.' };
  }
  return { name: `${baseName} Draft`, goal, type: CampaignType.THRESHOLD_DISCOUNT, discountType: 'fixed_amount', discountValue: 5, categoryName: null, thresholdAmount: 50, promoCode: null, usageLimit: null, customerEligibilityMode: CustomerEligibilityMode.ALL_CUSTOMERS, bannerCopy: 'Save when the basket reaches the threshold.', staffMessage: 'Suggest only when the basket is close to the threshold.' };
}
