import { BossDashboardFallback } from '../../boss-dashboard/boss-dashboard-fallback';
import type { BossDashboardReport, BossRange, WeeklyInsightReport } from '../../boss-dashboard/boss-dashboard.types';
import { metricsFixture } from './business-daily.fixture';

export const bossRangeFixture: BossRange = {
  from: '2026-07-24',
  to: '2026-07-30',
  timezone: 'Asia/Shanghai',
  preset: 'last7days',
  start: new Date('2026-07-23T16:00:00.000Z'),
  end: new Date('2026-07-30T15:59:59.999Z'),
};

export function bossDashboardFixture(): BossDashboardReport {
  return new BossDashboardFallback().buildDashboard({ range: bossRangeFixture, current: metricsFixture(), previous: metricsFixture(), fallback: true });
}

export function weeklyInsightFixture(): WeeklyInsightReport {
  return new BossDashboardFallback().buildWeekly({ range: bossRangeFixture, current: metricsFixture(), previous: metricsFixture(), fallback: true });
}
