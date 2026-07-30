import { BadRequestException, Injectable } from '@nestjs/common';

import { StoreContextService } from '@/common/store-context.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { DeepSeekProvider } from '@/modules/ai/providers/deepseek.provider';
import { collectEvidenceRefNodes } from '@/modules/ai/guardrails/ai-evidence-validator';
import { safeParseAiJson } from '@/modules/ai/guardrails/ai-provider-safe-parser';
import { validateAiOutput } from '@/modules/ai/guardrails/ai-output-validator';

import { BusinessDailyFallback } from '../business-daily/business-daily-fallback';
import { BusinessDailyRepository } from '../business-daily/business-daily.repository';
import type { BusinessDailyRange } from '../business-daily/business-daily.types';
import { BossDashboardFallback } from './boss-dashboard-fallback';
import { buildBossDashboardPrompt, buildWeeklyInsightPrompt } from './boss-dashboard-prompt';
import type { BossDashboardQuery, BossDashboardReport, BossRange, BossSection, WeeklyInsightQuery, WeeklyInsightReport } from './boss-dashboard.types';

@Injectable()
export class BossDashboardService {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly repository: BusinessDailyRepository,
    private readonly dailyFallback: BusinessDailyFallback,
    private readonly bossFallback: BossDashboardFallback,
    private readonly deepSeek: DeepSeekProvider,
  ) {}

  async getDashboard(query: BossDashboardQuery, currentUser: AuthRequestUser): Promise<BossDashboardReport> {
    const range = resolveBossRange(query);
    const previousRange = previousComparableRange(range);
    const [currentRaw, previousRaw] = await Promise.all([
      this.repository.load(this.storeContext.getStoreId(), range as unknown as BusinessDailyRange),
      this.repository.load(this.storeContext.getStoreId(), previousRange as unknown as BusinessDailyRange),
    ]);
    const current = this.dailyFallback.generate(range as unknown as BusinessDailyRange, currentRaw, { generatedBy: 'boss-dashboard-baseline', providerLabel: 'fallback', fallback: true }).metrics;
    const previous = this.dailyFallback.generate(previousRange as unknown as BusinessDailyRange, previousRaw, { generatedBy: 'boss-dashboard-baseline', providerLabel: 'fallback', fallback: true }).metrics;
    const baseline = this.bossFallback.buildDashboard({ range, current, previous, fallback: true });
    if (process.env.AI_POS_AI_DAILY_FORCE_FALLBACK === 'true') return baseline;
    try {
      const response = await this.deepSeek.generateStructuredResponse({ ...buildBossDashboardPrompt(baseline), timeoutMs: 10_000 });
      if (!response?.content) return baseline;
      const parsed = safeParseAiJson<Partial<BossDashboardReport>>(response.provider, response.content);
      if (!parsed.ok) return baseline;
      const report = this.mergeDashboard(baseline, parsed.value, currentUser.role);
      return validateBossDashboardReport(report).ok ? report : baseline;
    } catch {
      return baseline;
    }
  }

  async getWeeklyInsight(query: WeeklyInsightQuery, currentUser: AuthRequestUser): Promise<WeeklyInsightReport> {
    const range = resolveWeeklyRange(query);
    const previousRange = previousComparableRange(range);
    const [currentRaw, previousRaw] = await Promise.all([
      this.repository.load(this.storeContext.getStoreId(), range as unknown as BusinessDailyRange),
      this.repository.load(this.storeContext.getStoreId(), previousRange as unknown as BusinessDailyRange),
    ]);
    const current = this.dailyFallback.generate(range as unknown as BusinessDailyRange, currentRaw, { generatedBy: 'weekly-insight-baseline', providerLabel: 'fallback', fallback: true }).metrics;
    const previous = this.dailyFallback.generate(previousRange as unknown as BusinessDailyRange, previousRaw, { generatedBy: 'weekly-insight-baseline', providerLabel: 'fallback', fallback: true }).metrics;
    const baseline = this.bossFallback.buildWeekly({ range, current, previous, fallback: true });
    if (process.env.AI_POS_AI_DAILY_FORCE_FALLBACK === 'true') return baseline;
    try {
      const response = await this.deepSeek.generateStructuredResponse({ ...buildWeeklyInsightPrompt(baseline), timeoutMs: 10_000 });
      if (!response?.content) return baseline;
      const parsed = safeParseAiJson<Partial<WeeklyInsightReport>>(response.provider, response.content);
      if (!parsed.ok) return baseline;
      const report = this.mergeWeekly(baseline, parsed.value, currentUser.role);
      return validateWeeklyInsightReport(report).ok ? report : baseline;
    } catch {
      return baseline;
    }
  }

  private mergeDashboard(baseline: BossDashboardReport, parsed: Partial<BossDashboardReport>, role: AuthRequestUser['role']): BossDashboardReport {
    return {
      ...baseline,
      headline: cleanHeadline(parsed.headline, baseline.headline),
      insights: cleanSections(parsed.insights, baseline.insights, baseline),
      risks: cleanSections(parsed.risks, baseline.risks, baseline),
      nextActions: cleanSections(parsed.nextActions, baseline.nextActions, baseline),
      fallback: false,
      generatedAt: new Date().toISOString(),
    };
  }

  private mergeWeekly(baseline: WeeklyInsightReport, parsed: Partial<WeeklyInsightReport>, role: AuthRequestUser['role']): WeeklyInsightReport {
    void role;
    return {
      ...baseline,
      headline: cleanHeadline(parsed.headline, baseline.headline),
      summary: cleanSections(parsed.summary, baseline.summary, baseline),
      highlights: cleanSections(parsed.highlights, baseline.highlights, baseline),
      risks: cleanSections(parsed.risks, baseline.risks, baseline),
      trendExplanations: cleanSections(parsed.trendExplanations, baseline.trendExplanations, baseline),
      nextWeekActions: cleanSections(parsed.nextWeekActions, baseline.nextWeekActions, baseline),
      campaignSuggestions: cleanSections(parsed.campaignSuggestions, baseline.campaignSuggestions, baseline),
      fallback: false,
      generatedAt: new Date().toISOString(),
    };
  }
}

export function validateBossDashboardReport(report: BossDashboardReport) {
  return validateAiOutput('AI Boss Dashboard', report, {
    requiredFields: ['range', 'headline', 'healthScore', 'scoreBreakdown', 'trend', 'sections', 'evidence', 'generatedAt'],
    arrayFields: ['insights', 'risks', 'nextActions', 'evidence'],
    nonEmptyTextFields: ['headline'],
    evidenceRequired: report.evidence.length > 0,
    evidenceNodes: collectEvidenceRefNodes({
      insights: report.insights,
      risks: report.risks,
      nextActions: report.nextActions,
    }),
  });
}

export function validateWeeklyInsightReport(report: WeeklyInsightReport) {
  return validateAiOutput('AI Weekly Insight', report, {
    requiredFields: ['week', 'headline', 'evidence', 'generatedAt'],
    arrayFields: ['summary', 'highlights', 'risks', 'trendExplanations', 'nextWeekActions', 'campaignSuggestions', 'evidence'],
    nonEmptyTextFields: ['headline'],
    evidenceRequired: report.evidence.length > 0,
    evidenceNodes: collectEvidenceRefNodes({
      summary: report.summary,
      highlights: report.highlights,
      risks: report.risks,
      trendExplanations: report.trendExplanations,
      nextWeekActions: report.nextWeekActions,
      campaignSuggestions: report.campaignSuggestions,
    }),
  });
}

function cleanHeadline(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.slice(0, 240) : fallback;
}

function cleanSections<T extends { evidence: Array<{ id: string }> }>(sections: unknown, fallbacks: BossSection[], baseline: T): BossSection[] {
  const evidenceIds = new Set(baseline.evidence.map((item) => item.id));
  if (!Array.isArray(sections)) return fallbacks;
  const cleaned = sections
    .map((section, index) => {
      const candidate = section as Partial<BossSection>;
      const ids = Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds.filter((id): id is string => typeof id === 'string' && evidenceIds.has(id)) : [];
      if (typeof candidate.text !== 'string' || candidate.text.trim().length === 0 || ids.length === 0) return fallbacks[index];
      return { text: candidate.text.slice(0, 360), evidenceIds: ids };
    })
    .filter((section): section is BossSection => Boolean(section?.text && section.evidenceIds.length > 0));
  return cleaned.length > 0 ? cleaned.slice(0, 8) : fallbacks;
}

export function resolveBossRange(query: BossDashboardQuery = {}): BossRange {
  const timezone = query.timezone ?? 'Asia/Shanghai';
  if (timezone !== 'Asia/Shanghai') throw new BadRequestException('AI Boss Dashboard currently supports timezone Asia/Shanghai.');
  const preset = query.preset ?? 'last7days';
  if (!['today', 'yesterday', 'last7days', 'thisMonth'].includes(preset)) throw new BadRequestException('Unsupported AI Boss Dashboard preset.');
  const today = localDate(new Date());
  const current = presetRange(preset, today);
  return { ...current, timezone, preset, start: localStartToUtc(current.from), end: localEndToUtc(current.to) };
}

export function resolveWeeklyRange(query: WeeklyInsightQuery = {}): BossRange {
  const timezone = query.timezone ?? 'Asia/Shanghai';
  if (timezone !== 'Asia/Shanghai') throw new BadRequestException('AI Weekly Insight currently supports timezone Asia/Shanghai.');
  const start = query.weekStart ? normalizeDate(query.weekStart) : weekStart(localDate(new Date()));
  const end = formatDate(addDays(parseDate(start), 6));
  return { from: start, to: end, timezone, preset: 'last7days', start: localStartToUtc(start), end: localEndToUtc(end) };
}

function previousComparableRange(range: BossRange): BossRange {
  const days = daysBetween(range.from, range.to) + 1;
  const previousTo = formatDate(addDays(parseDate(range.from), -1));
  const previousFrom = formatDate(addDays(parseDate(previousTo), -(days - 1)));
  return { ...range, from: previousFrom, to: previousTo, start: localStartToUtc(previousFrom), end: localEndToUtc(previousTo) };
}

function presetRange(preset: BossDashboardQuery['preset'], today: string) {
  const date = parseDate(today);
  if (!preset || preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const value = addDays(date, -1);
    return { from: formatDate(value), to: formatDate(value) };
  }
  if (preset === 'last7days') return { from: formatDate(addDays(date, -6)), to: today };
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return { from: formatDate(first), to: today };
}

function normalizeDate(input: string) {
  const value = input.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('AI Weekly dates must use YYYY-MM-DD.');
  return value;
}

function weekStart(today: string) {
  const date = parseDate(today);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return formatDate(addDays(date, offset));
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

function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}
