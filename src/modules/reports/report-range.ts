import { BadRequestException } from '@nestjs/common';

export type ReportPreset = 'today' | 'yesterday' | 'last7days' | 'thisMonth' | 'lastMonth' | 'custom';

export type ReportRangeQuery = {
  from?: string;
  to?: string;
  timezone?: string;
  preset?: ReportPreset;
  limit?: number;
  type?: ReportExportType;
  format?: 'csv';
};

export type ReportExportType = 'summary' | 'products' | 'customers' | 'campaigns' | 'payments' | 'shifts';

export type ReportRange = {
  from: string;
  to: string;
  timezone: string;
  preset: ReportPreset;
  start: Date;
  end: Date;
};

const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function resolveReportRange(query: ReportRangeQuery = {}): ReportRange {
  const timezone = query.timezone ?? DEFAULT_TIMEZONE;
  if (timezone !== DEFAULT_TIMEZONE) {
    throw new BadRequestException('Reports currently support timezone Asia/Shanghai.');
  }
  const preset = query.preset ?? (query.from || query.to ? 'custom' : 'today');
  const today = localDateParts(new Date());
  const range = preset === 'custom'
    ? customRange(query)
    : presetRange(preset, today);
  return {
    from: range.from,
    to: range.to,
    timezone,
    preset,
    start: localStartToUtc(range.from),
    end: localEndToUtc(range.to),
  };
}

export function resolveReportLimit(value: number | undefined, fallback = 20) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit) || limit < 1) return fallback;
  return Math.min(Math.floor(limit), 100);
}

function customRange(query: ReportRangeQuery) {
  if (!query.from || !query.to) {
    throw new BadRequestException('Custom reports require from and to.');
  }
  const from = normalizeDate(query.from);
  const to = normalizeDate(query.to);
  if (localStartToUtc(from) > localEndToUtc(to)) {
    throw new BadRequestException('Report from must be before to.');
  }
  return { from, to };
}

function presetRange(preset: ReportPreset, today: string) {
  const date = parseLocalDate(today);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') {
    const value = addDays(date, -1);
    return { from: formatLocalDate(value), to: formatLocalDate(value) };
  }
  if (preset === 'last7days') return { from: formatLocalDate(addDays(date, -6)), to: today };
  if (preset === 'thisMonth') return { from: `${today.slice(0, 8)}01`, to: today };
  if (preset === 'lastMonth') {
    const firstThisMonth = parseLocalDate(`${today.slice(0, 8)}01`);
    const lastLastMonth = addDays(firstThisMonth, -1);
    return { from: `${formatLocalDate(lastLastMonth).slice(0, 8)}01`, to: formatLocalDate(lastLastMonth) };
  }
  throw new BadRequestException('Unsupported report preset.');
}

function normalizeDate(input: string) {
  const value = input.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Report dates must use YYYY-MM-DD.');
  }
  return value;
}

function localStartToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - SHANGHAI_OFFSET_MS);
}

function localEndToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - SHANGHAI_OFFSET_MS);
}

function localDateParts(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function parseLocalDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatLocalDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
