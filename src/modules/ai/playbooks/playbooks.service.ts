import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { StoreContextService } from '@/common/store-context.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { BusinessDailyFallback } from '../business-daily/business-daily-fallback';
import { BusinessDailyRepository } from '../business-daily/business-daily.repository';
import { resolveBusinessDailyRange } from '../business-daily/business-daily.service';
import type { BusinessDailyRange } from '../business-daily/business-daily.types';
import { PLAYBOOK_DEFINITIONS, getPlaybookDefinition } from './playbook-definitions';
import { PlaybookEvidenceService } from './playbook-evidence';
import { PlaybookFallback } from './playbook-fallback';
import { PlaybooksRepository } from './playbooks.repository';
import type { RunPlaybookDto } from './dto/playbook.dto';

@Injectable()
export class PlaybooksService {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly dailyRepository: BusinessDailyRepository,
    private readonly dailyFallback: BusinessDailyFallback,
    private readonly evidence: PlaybookEvidenceService,
    private readonly fallback: PlaybookFallback,
    private readonly repository: PlaybooksRepository,
  ) {}

  list() {
    return { items: PLAYBOOK_DEFINITIONS.map(({ objective, steps, actionKinds, campaignDraftEnabled, ...card }) => card) };
  }

  async run(type: string, dto: RunPlaybookDto, currentUser: AuthRequestUser) {
    const definition = getPlaybookDefinition(type);
    if (!definition || !definition.enabled) throw new BadRequestException('Unsupported AI playbook type.');
    const storeId = this.storeContext.getStoreId();
    const range = resolveBusinessDailyRange({ ...dto, from: dto.from ?? undefined, to: dto.to ?? undefined });
    const previousRange = previousComparableRange(range);
    const [currentRaw, previousRaw] = await Promise.all([
      this.dailyRepository.load(storeId, range),
      this.dailyRepository.load(storeId, previousRange),
    ]);
    const current = this.dailyFallback.generate(range, currentRaw, { generatedBy: 'ai-playbook-fallback', providerLabel: 'fallback', fallback: true });
    const previous = this.dailyFallback.generate(previousRange, previousRaw, { generatedBy: 'ai-playbook-fallback', providerLabel: 'fallback', fallback: true });
    const evidence = await this.evidence.collect({ storeId, definition, current, previous, range });
    const runId = `playbook_${randomUUID()}`;
    const result = this.fallback.generate({ runId, definition, current, previous, evidence });
    return this.repository.create(storeId, currentUser.id, result);
  }

  history() {
    return this.repository.list(this.storeContext.getStoreId());
  }

  detail(id: string) {
    return this.repository.detail(this.storeContext.getStoreId(), id);
  }
}

function previousComparableRange(range: BusinessDailyRange): BusinessDailyRange {
  const days = daysInclusive(range.from, range.to);
  const previousTo = addDays(parseLocalDate(range.from), -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  const from = formatDate(previousFrom);
  const to = formatDate(previousTo);
  return {
    from,
    to,
    timezone: range.timezone,
    preset: 'custom',
    start: localStartToUtc(from),
    end: localEndToUtc(to),
  };
}

function daysInclusive(from: string, to: string) {
  const diff = parseLocalDate(to).getTime() - parseLocalDate(from).getTime();
  return Math.max(1, Math.floor(diff / 86_400_000) + 1);
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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localStartToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

function localEndToUtc(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 8 * 60 * 60 * 1000);
}
