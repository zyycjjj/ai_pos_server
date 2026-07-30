import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiActionSourceType, AiActionType } from '@prisma/client';

import { AiActionNormalizer } from './ai-action-normalizer';

describe('AiActionNormalizer', () => {
  const normalizer = new AiActionNormalizer();
  const evidence = [{ id: 'ev-sales', type: 'METRIC', title: 'Net sales', value: 120 }];

  it('normalizes an evidence-backed suggested action', () => {
    const action = normalizer.normalize({
      sourceType: AiActionSourceType.AI_ASK,
      sourceTitle: 'How are sales today?',
      actionType: AiActionType.VIEW_REPORT,
      title: 'Review sales report',
      targetUrl: '/reports',
      evidenceSnapshot: evidence,
    });

    assert.equal(action.sourceType, 'AI_ASK');
    assert.equal(action.actionType, 'VIEW_REPORT');
    assert.equal(action.priority, 'MEDIUM');
    assert.equal(action.targetType, 'REPORT');
    assert.equal(action.evidenceSnapshot?.[0].id, 'ev-sales');
  });

  it('requires evidence except for manual notes', () => {
    assert.throws(() => normalizer.normalize({
      sourceType: AiActionSourceType.AI_WEEKLY,
      actionType: AiActionType.VIEW_REPORT,
      title: 'Review weekly report',
      evidenceSnapshot: [],
    }), /evidenceSnapshot is required/);

    const manual = normalizer.normalize({
      sourceType: AiActionSourceType.MANUAL,
      actionType: AiActionType.MANUAL_NOTE,
      title: 'Manager follow-up',
    });
    assert.equal(manual.actionType, 'MANUAL_NOTE');
  });

  it('rejects external and API target URLs', () => {
    assert.throws(() => normalizer.normalize({
      sourceType: AiActionSourceType.AI_ASK,
      actionType: AiActionType.VIEW_REPORT,
      title: 'Unsafe target',
      targetUrl: 'https://example.com',
      evidenceSnapshot: evidence,
    }), /internal path/);

    assert.throws(() => normalizer.normalize({
      sourceType: AiActionSourceType.AI_ASK,
      actionType: AiActionType.VIEW_REPORT,
      title: 'Unsafe API target',
      targetUrl: '/api/admin/orders',
      evidenceSnapshot: evidence,
    }), /must not point/);
  });
});
