import assert from 'node:assert/strict';
import test from 'node:test';

import { CopilotContextRouter } from '../context/copilot-context.router';
import { parseCopilotResponse } from '../parsers/copilot-response.parser';
import { DeterministicFallbackProvider } from '../providers/deterministic-fallback.provider';

test('copilot context router classifies business domains without an LLM', () => {
  const router = new CopilotContextRouter();
  assert.equal(router.resolve('Why are refunds increasing?'), 'REFUND');
  assert.equal(router.resolve('Which kitchen station is slowest?'), 'KITCHEN');
  assert.equal(router.resolve('Which products are underperforming?'), 'PRODUCT');
  assert.equal(router.resolve('How are customers paying?'), 'PAYMENT');
});

test('deterministic fallback uses backend analytics numbers and missing coverage', () => {
  const fallback = new DeterministicFallbackProvider();
  const response = fallback.generate({
    reason: 'DeepSeek unavailable',
    context: {
      overview: { netSales: 820, orderCount: 41, refundTotal: 12 },
      comparison: { netSalesChangePercent: -21.9, orderCountChangePercent: -8.1 },
      signals: [{ type: 'SALES_DOWN', severity: 'WARNING', metric: 'netSales', changePercent: -21.9, label: 'Net sales decreased 21.9%.' }],
      coverage: { sales: true, inventory: false },
    },
  });

  assert.match(response.answer, /820/);
  assert.match(response.answer, /-21.9/);
  assert.equal(response.evidence[0].value, 820);
  assert.equal(response.evidence[0].changePercent, -21.9);
  assert.ok(response.limitations.some((item) => item.includes('inventory')));
});

test('copilot parser accepts strict structured JSON and ignores LLM-provided evidence', () => {
  const parsed = parseCopilotResponse(JSON.stringify({
    answer: 'Sales were lower based on supplied data.',
    summary: 'Net sales declined.',
    evidence: [{ label: 'Fake', value: 999999 }],
    drivers: [{ type: 'SALES_DOWN', text: 'Evening sales declined.' }],
    risks: [{ severity: 'WARNING', text: 'Refunds need review.' }],
    recommendations: [{ title: 'Review staffing', description: 'Check evening coverage.' }],
    limitations: ['Inventory data is unavailable.'],
  }));

  assert.equal(parsed.answer, 'Sales were lower based on supplied data.');
  assert.deepEqual(parsed.drivers, [{ type: 'SALES_DOWN', text: 'Evening sales declined.' }]);
  assert.equal('evidence' in parsed, false);
});

