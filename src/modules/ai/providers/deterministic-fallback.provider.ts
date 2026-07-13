import { Injectable } from '@nestjs/common';

import type { CopilotStructuredResponse } from '../copilot/copilot.types';

@Injectable()
export class DeterministicFallbackProvider {
  generate(input: { context: Record<string, any>; reason?: string }): CopilotStructuredResponse {
    const overview = input.context.overview ?? {};
    const comparison = input.context.comparison ?? {};
    const signals = Array.isArray(input.context.signals) ? input.context.signals : [];
    const coverage = input.context.coverage ?? {};
    const topSignal = signals[0];
    const netSales = numberOrNull(overview.netSales);
    const orderCount = numberOrNull(overview.orderCount);
    const netSalesChange = numberOrNull(comparison.netSalesChangePercent);
    const orderChange = numberOrNull(comparison.orderCountChangePercent);

    const answerParts = [
      netSales === null ? 'Net sales data is unavailable for this period.' : `Net sales are ${netSales}.`,
      orderCount === null ? undefined : `Order count is ${orderCount}.`,
      netSalesChange === null ? undefined : `Net sales changed ${netSalesChange}% versus the comparison period.`,
      input.reason ? `Provider fallback was used: ${input.reason}.` : 'Provider fallback was used.',
    ].filter(Boolean);

    return {
      answer: answerParts.join(' '),
      summary: topSignal?.label ?? 'This summary is generated from deterministic analytics metrics.',
      evidence: [
        { label: 'Net sales', value: netSales, changePercent: netSalesChange },
        { label: 'Orders', value: orderCount, changePercent: orderChange },
        { label: 'Refund total', value: numberOrNull(overview.refundTotal) },
      ],
      drivers: signals.slice(0, 4).map((signal: any) => ({
        type: String(signal.type ?? 'SIGNAL'),
        text: signal.label ?? `${signal.metric ?? 'Metric'} changed by ${signal.changePercent ?? 'n/a'}%.`,
      })),
      risks: signals
        .filter((signal: any) => signal.severity === 'WARNING')
        .slice(0, 4)
        .map((signal: any) => ({ severity: 'WARNING' as const, text: signal.label ?? String(signal.type) })),
      recommendations: [
        {
          title: 'Review the strongest signal',
          description: topSignal?.label ?? 'Use the analytics page to inspect sales, product, refund, shift, and kitchen detail before changing operations.',
        },
      ],
      limitations: Object.entries(coverage)
        .filter(([, value]) => value === false)
        .map(([key]) => `${key} data is not available in the current analytics context.`),
    };
  }
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

