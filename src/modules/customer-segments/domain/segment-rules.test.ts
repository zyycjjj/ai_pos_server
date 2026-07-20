import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvalidCustomerSegmentRuleError, matchesCustomerSegmentRule, parseCustomerSegmentRule } from './segment-rules';

describe('customer segment rules', () => {
  it('validates supported non-negative smart-rule fields', () => {
    assert.deepEqual(parseCustomerSegmentRule({ minOrderCount: 2, minTotalSpend: '50', minPointsBalance: 10 }), {
      minOrderCount: 2,
      minTotalSpend: 50,
      minPointsBalance: 10,
    });
    assert.throws(() => parseCustomerSegmentRule({ minOrderCount: -1 }), InvalidCustomerSegmentRuleError);
    assert.throws(() => parseCustomerSegmentRule({ unsupported: 1 }), InvalidCustomerSegmentRuleError);
  });

  it('matches customers from behavior snapshots', () => {
    const now = new Date('2026-07-20T00:00:00.000Z');
    const customer = {
      orderCount: 3,
      totalSpend: 120,
      pointsBalance: 18,
      lastOrderAt: new Date('2026-07-15T00:00:00.000Z'),
    };
    assert.equal(matchesCustomerSegmentRule({ minOrderCount: 2, minTotalSpend: 100, lastOrderWithinDays: 7 }, customer, now), true);
    assert.equal(matchesCustomerSegmentRule({ minOrderCount: 4 }, customer, now), false);
    assert.equal(matchesCustomerSegmentRule({ lastOrderBeforeDays: 10 }, customer, now), false);
  });
});
