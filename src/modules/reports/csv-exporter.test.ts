import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { csvResponse } from './csv-exporter';

describe('csv exporter', () => {
  it('exports a UTF-8 CSV with header and escaped values', () => {
    const csv = csvResponse([{ name: 'Latte, Large', netSales: 12.5 }]);

    assert.equal(csv.startsWith('\uFEFFname,netSales'), true);
    assert.match(csv, /"Latte, Large",12.5/);
  });
});
