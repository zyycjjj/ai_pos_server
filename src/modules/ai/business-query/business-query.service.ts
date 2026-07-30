import { Injectable } from '@nestjs/common';

import { StoreContextService } from '@/common/store-context.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { DeepSeekProvider } from '@/modules/ai/providers/deepseek.provider';

import { BossDashboardFallback } from '../boss-dashboard/boss-dashboard-fallback';
import type { BossDashboardReport } from '../boss-dashboard/boss-dashboard.types';
import { BusinessDailyFallback } from '../business-daily/business-daily-fallback';
import { BusinessDailyRepository } from '../business-daily/business-daily.repository';
import { resolveBusinessDailyRange } from '../business-daily/business-daily.service';
import type { BusinessDailyRange } from '../business-daily/business-daily.types';
import type { BusinessDailyQueryDto } from '../business-daily/dto/business-daily.dto';
import { buildBusinessQueryEvidence } from './business-query-evidence';
import { BusinessQueryFallback } from './business-query-fallback';
import { BusinessQueryHistoryRepository } from './business-query-history.repository';
import { classifyBusinessQueryIntent } from './business-query-intent';
import { buildBusinessQueryPrompt } from './business-query-prompt';
import type { BusinessQueryAnswer, BusinessQueryDetail, BusinessQueryDtoShape, BusinessQueryResponse } from './business-query.types';

@Injectable()
export class BusinessQueryService {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly repository: BusinessDailyRepository,
    private readonly dailyFallback: BusinessDailyFallback,
    private readonly bossFallback: BossDashboardFallback,
    private readonly fallback: BusinessQueryFallback,
    private readonly history: BusinessQueryHistoryRepository,
    private readonly deepSeek: DeepSeekProvider,
  ) {}

  async ask(dto: BusinessQueryDtoShape, currentUser: AuthRequestUser): Promise<BusinessQueryResponse> {
    const question = dto.question.trim();
    const intent = classifyBusinessQueryIntent(question);
    const dailyQuery = normalizeDailyQuery(dto);
    const range = resolveBusinessDailyRange(dailyQuery);
    const dailyRaw = await this.repository.load(this.storeContext.getStoreId(), range);
    const daily = this.dailyFallback.generate(range, dailyRaw, { generatedBy: 'business-query-baseline', providerLabel: 'fallback', fallback: true });
    const boss = await this.tryBossDashboard(range);
    const evidence = buildBusinessQueryEvidence(intent, daily, boss);
    const baseline: BusinessQueryResponse = {
      question,
      intent,
      range: daily.range,
      answer: this.fallback.answer({ question, intent, daily, evidence }),
      evidence,
      suggestedActions: this.fallback.suggestedActions(intent, evidence),
      fallback: true,
      generatedAt: new Date().toISOString(),
    };
    const response = await this.tryProviderAnswer(baseline);
    await this.history.record({ storeId: this.storeContext.getStoreId(), userId: currentUser.id, response });
    return response;
  }

  historyFor(currentUser: AuthRequestUser) {
    return this.history.list(this.storeContext.getStoreId(), currentUser.id);
  }

  private async tryBossDashboard(range: BusinessDailyRange): Promise<BossDashboardReport | undefined> {
    if (range.preset === 'custom') return undefined;
    try {
      const previous = previousComparableRange(range);
      const [currentRaw, previousRaw] = await Promise.all([
        this.repository.load(this.storeContext.getStoreId(), range),
        this.repository.load(this.storeContext.getStoreId(), previous),
      ]);
      const currentMetrics = this.dailyFallback.generate(range, currentRaw, { generatedBy: 'business-query-baseline', providerLabel: 'fallback', fallback: true }).metrics;
      const previousMetrics = this.dailyFallback.generate(previous, previousRaw, { generatedBy: 'business-query-baseline', providerLabel: 'fallback', fallback: true }).metrics;
      return this.bossFallback.buildDashboard({ range: { ...range, preset: range.preset === 'last7days' ? 'last7days' : range.preset }, current: currentMetrics, previous: previousMetrics, fallback: true });
    } catch {
      return undefined;
    }
  }

  private async tryProviderAnswer(baseline: BusinessQueryResponse): Promise<BusinessQueryResponse> {
    if (process.env.AI_POS_AI_DAILY_FORCE_FALLBACK === 'true' || baseline.intent === 'UNSUPPORTED') return baseline;
    try {
      const response = await this.deepSeek.generateStructuredResponse({ ...buildBusinessQueryPrompt(baseline), timeoutMs: 10_000 });
      if (!response?.content) return baseline;
      const parsed = JSON.parse(response.content) as Partial<BusinessQueryResponse>;
      return {
        ...baseline,
        answer: cleanAnswer(parsed.answer, baseline.answer, baseline.evidence.map((item) => item.id)),
        fallback: false,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      return baseline;
    }
  }
}

function normalizeDailyQuery(dto: BusinessQueryDtoShape): BusinessDailyQueryDto {
  const query = {
    preset: dto.preset ?? (dto.from || dto.to ? 'custom' : 'today'),
    from: dto.from ?? undefined,
    to: dto.to ?? undefined,
    timezone: dto.timezone ?? 'Asia/Shanghai',
  } satisfies BusinessDailyQueryDto;
  resolveBusinessDailyRange(query);
  return query;
}

function previousComparableRange(range: BusinessDailyRange): BusinessDailyRange {
  const days = daysBetween(range.from, range.to) + 1;
  const previousTo = formatDate(addDays(parseDate(range.from), -1));
  const previousFrom = formatDate(addDays(parseDate(previousTo), -(days - 1)));
  return { ...range, from: previousFrom, to: previousTo, start: localStartToUtc(previousFrom), end: localEndToUtc(previousTo) };
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

function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

function localStartToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

function localEndToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 8 * 60 * 60 * 1000);
}

function cleanAnswer(answer: unknown, fallback: BusinessQueryAnswer, evidenceIds: string[]): BusinessQueryAnswer {
  const candidate = answer as Partial<BusinessQueryAnswer> | undefined;
  if (!candidate) return fallback;
  const details = cleanDetails(candidate.details, fallback.details, evidenceIds);
  return {
    headline: typeof candidate.headline === 'string' && candidate.headline.trim() ? candidate.headline.slice(0, 240) : fallback.headline,
    summary: typeof candidate.summary === 'string' && candidate.summary.trim() ? candidate.summary.slice(0, 800) : fallback.summary,
    details,
    limitations: Array.isArray(candidate.limitations) ? candidate.limitations.filter((item): item is string => typeof item === 'string').slice(0, 5) : fallback.limitations,
  };
}

function cleanDetails(details: unknown, fallbacks: BusinessQueryDetail[], evidenceIds: string[]) {
  const allowed = new Set(evidenceIds);
  if (!Array.isArray(details)) return fallbacks;
  const cleaned = details
    .map((detail, index) => {
      const candidate = detail as Partial<BusinessQueryDetail>;
      const ids = Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds.filter((id): id is string => typeof id === 'string' && allowed.has(id)) : [];
      if (!candidate.title || !candidate.text || ids.length === 0) return fallbacks[index];
      return { title: candidate.title.slice(0, 120), text: candidate.text.slice(0, 600), evidenceIds: ids };
    })
    .filter((detail): detail is BusinessQueryDetail => Boolean(detail?.title && detail.evidenceIds.length > 0));
  return cleaned.length > 0 ? cleaned.slice(0, 6) : fallbacks;
}
