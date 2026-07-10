import assert from 'node:assert/strict';
import test from 'node:test';

import { comparisonPeriod, hourBuckets, resolvePeriod, zonedDateTimeToUtc } from './analytics-time';

test('store business day converts to correct UTC boundaries', () => {
  const tokyo = resolvePeriod({ from: '2026-07-10', to: '2026-07-10', timezone: 'Asia/Tokyo' });
  const newYork = resolvePeriod({ from: '2026-07-10', to: '2026-07-10', timezone: 'America/New_York' });
  assert.equal(tokyo.start.toISOString(), '2026-07-09T15:00:00.000Z');
  assert.equal(newYork.start.toISOString(), '2026-07-10T04:00:00.000Z');
});

test('previous week keeps comparable local weekday', () => {
  const current = resolvePeriod({ from: '2026-07-06', to: '2026-07-06', timezone: 'UTC' });
  const previous = comparisonPeriod(current, 'previous_week');
  assert.deepEqual({ from: previous.from, to: previous.to }, { from: '2026-06-29', to: '2026-06-29' });
});

test('hour buckets respect daylight-saving transition', () => {
  const period = resolvePeriod({ from: '2026-03-08', to: '2026-03-08', timezone: 'America/New_York' });
  assert.equal((period.end.getTime() - period.start.getTime()) / 3_600_000, 23);
  const buckets = hourBuckets(period);
  assert.equal(buckets[0].start.toISOString(), '2026-03-08T05:00:00.000Z');
});

test('hourly conversion maps local 8 AM into the correct UTC instant', () => {
  assert.equal(zonedDateTimeToUtc({ date: '2026-07-10', hour: 8, timezone: 'Asia/Tokyo' }).toISOString(), '2026-07-09T23:00:00.000Z');
});
