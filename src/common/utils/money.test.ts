import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { multiplyMoney, toMoneyNumber } from './money';

describe('money utilities', () => {
  it('rounds money values to two decimal places', () => {
    assert.equal(toMoneyNumber(3.456), 3.46);
    assert.equal(toMoneyNumber('9.994'), 9.99);
  });

  it('multiplies prices without floating point drift', () => {
    assert.equal(Number(multiplyMoney(3.5, 3).toFixed(2)), 10.5);
    assert.equal(Number(multiplyMoney('4.25', 2).toFixed(2)), 8.5);
  });
});
