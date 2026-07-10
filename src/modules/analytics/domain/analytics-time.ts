import type { AnalyticsCompare, AnalyticsPeriod, DateBucket } from '../analytics.types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class AnalyticsPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsPeriodError';
  }
}

const partsInZone = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
};

export const zonedDateTimeToUtc = (input: { date: string; hour?: number; minute?: number; timezone: string }) => {
  const [year, month, day] = input.date.split('-').map(Number);
  let candidate = new Date(Date.UTC(year, month - 1, day, input.hour ?? 0, input.minute ?? 0));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInZone(candidate, input.timezone);
    const desiredUtc = Date.UTC(year, month - 1, day, input.hour ?? 0, input.minute ?? 0);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate = new Date(candidate.getTime() + desiredUtc - actualUtc);
  }
  return candidate;
};

export const formatBusinessDate = (date: Date, timezone: string) => {
  const parts = partsInZone(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const addDays = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
};

const daysBetweenInclusive = (from: string, to: string) => {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
};

export const resolvePeriod = (input: { from?: string; to?: string; timezone: string; now?: Date }): AnalyticsPeriod => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format();
  } catch {
    throw new AnalyticsPeriodError('Store timezone is invalid.');
  }
  const today = formatBusinessDate(input.now ?? new Date(), input.timezone);
  const from = input.from ?? today;
  const to = input.to ?? from;
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw new AnalyticsPeriodError('Analytics dates must use YYYY-MM-DD and from must not exceed to.');
  }
  const days = daysBetweenInclusive(from, to);
  if (days > 90) throw new AnalyticsPeriodError('Analytics date range cannot exceed 90 days.');
  return {
    from,
    to,
    timezone: input.timezone,
    start: zonedDateTimeToUtc({ date: from, timezone: input.timezone }),
    end: zonedDateTimeToUtc({ date: addDays(to, 1), timezone: input.timezone }),
  };
};

export const resolvePresetDates = (preset: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days', timezone: string, now = new Date()) => {
  const today = formatBusinessDate(now, timezone);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  return { from: addDays(today, preset === 'last_7_days' ? -6 : -29), to: today };
};

export const comparisonPeriod = (period: AnalyticsPeriod, compare: AnalyticsCompare): AnalyticsPeriod => {
  const days = daysBetweenInclusive(period.from, period.to);
  const shift = compare === 'previous_week' ? -7 : compare === 'previous_day' ? -1 : -days;
  const from = addDays(period.from, shift);
  const to = addDays(period.to, shift);
  return resolvePeriod({ from, to, timezone: period.timezone });
};

export const dateBuckets = (period: AnalyticsPeriod): DateBucket[] => {
  const buckets: DateBucket[] = [];
  for (let cursor = period.from; cursor <= period.to; cursor = addDays(cursor, 1)) {
    buckets.push({
      label: cursor,
      start: zonedDateTimeToUtc({ date: cursor, timezone: period.timezone }),
      end: zonedDateTimeToUtc({ date: addDays(cursor, 1), timezone: period.timezone }),
    });
  }
  return buckets;
};

export const hourBuckets = (period: AnalyticsPeriod): Array<DateBucket & { hour: number }> =>
  Array.from(
    { length: Math.round((period.end.getTime() - period.start.getTime()) / 3_600_000) },
    (_, index) => {
      const start = new Date(period.start.getTime() + index * 3_600_000);
      const end = new Date(Math.min(period.end.getTime(), start.getTime() + 3_600_000));
      const local = partsInZone(start, period.timezone);
      const date = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
      return { label: `${date}-${String(local.hour).padStart(2, '0')}`, hour: local.hour, start, end };
    },
  );
