import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveReportRange } from './report-range';

describe('report range', () => {
  it('resolves custom date ranges in Asia/Shanghai', () => {
    const range = resolveReportRange({ preset: 'custom', from: '2026-07-21', to: '2026-07-22' });

    assert.equal(range.from, '2026-07-21');
    assert.equal(range.to, '2026-07-22');
    assert.equal(range.timezone, 'Asia/Shanghai');
    assert.equal(range.start.toISOString(), '2026-07-20T16:00:00.000Z');
    assert.equal(range.end.toISOString(), '2026-07-22T15:59:59.999Z');
  });

  it('rejects custom ranges without both dates', () => {
    assert.throws(() => resolveReportRange({ preset: 'custom', from: '2026-07-21' }), /from and to/);
  });
});
