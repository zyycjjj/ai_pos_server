import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AiQualityError } from './ai-quality-errors';
import { assertCampaignDraftSafety } from './ai-campaign-draft-guard';
import { validateEvidenceRefs } from './ai-evidence-validator';
import { safeParseAiJson } from './ai-provider-safe-parser';
import { validateSuggestedActions } from './ai-suggested-action-validator';
import { validateAiOutput } from './ai-output-validator';
import { invalidProviderOutputs } from '../evaluation/fixtures/invalid-provider-output.fixture';

describe('AI quality guardrails', () => {
  const evidence = [{ id: 'ev_sales', type: 'METRIC', title: 'Net sales', value: 60 }];

  it('safeParseAiJson handles empty, non-json, fenced, wrapped, primitive, and malformed provider output', () => {
    assert.equal(safeParseAiJson('deepseek', invalidProviderOutputs.empty).ok, false);
    assert.equal(safeParseAiJson('deepseek', invalidProviderOutputs.nonJson).ok, false);
    assert.equal(safeParseAiJson('deepseek', invalidProviderOutputs.primitive).ok, false);

    const fenced = safeParseAiJson<{ headline: string }>('deepseek', invalidProviderOutputs.fenced);
    assert.equal(fenced.ok, true);
    if (fenced.ok) assert.equal(fenced.value.headline, 'Recovered from fenced json');

    const wrapped = safeParseAiJson<{ headline: string }>('deepseek', invalidProviderOutputs.wrapped);
    assert.equal(wrapped.ok, true);
    if (wrapped.ok) assert.equal(wrapped.value.headline, 'Recovered from wrapped json');

    assert.equal(safeParseAiJson('deepseek', invalidProviderOutputs.truncatedLongText).ok, false);
  });

  it('validates evidence shape and evidenceIds', () => {
    const valid = validateEvidenceRefs(evidence, [{ path: 'summary', evidenceIds: ['ev_sales'], required: true }]);
    assert.equal(valid.ok, true);

    const invalid = validateEvidenceRefs(evidence, [{ path: 'summary', evidenceIds: ['missing'], required: true }]);
    assert.equal(invalid.ok, false);
    assert.match(invalid.issues[0].message, /Unknown evidence id/);
  });

  it('validates schema fields and evidence-backed details', () => {
    const result = validateAiOutput('test-module', { headline: 'Sales', details: [{ evidenceIds: ['ev_sales'] }] }, {
      requiredFields: ['headline', 'details'],
      arrayFields: ['details'],
      nonEmptyTextFields: ['headline'],
      evidenceNodes: [{ path: 'details.0', evidenceIds: ['ev_sales'], required: true }],
    }, { evidence });
    assert.equal(result.ok, true);
  });

  it('rejects unsafe suggested actions', () => {
    assert.equal(validateSuggestedActions([{ kind: 'VIEW_REPORT', label: 'Reports', href: '/reports', evidenceIds: ['ev_sales'] }], evidence).ok, true);
    assert.equal(validateSuggestedActions([{ kind: 'VIEW_REPORT', label: 'External', href: 'https://example.com', evidenceIds: ['ev_sales'] }], evidence).ok, false);
    assert.equal(validateSuggestedActions([{ kind: 'VIEW_REPORT', label: 'API', href: '/api/orders', evidenceIds: ['ev_sales'] }], evidence).ok, false);
    assert.equal(validateSuggestedActions([{ kind: 'VIEW_REPORT', label: 'Missing evidence', href: '/reports', evidenceIds: ['ev_missing'] }], evidence).ok, false);
  });

  it('keeps campaign drafts draft-only and evidence-backed', () => {
    assert.doesNotThrow(() => assertCampaignDraftSafety({
      status: 'DRAFT',
      aiMetadata: { aiEvidenceSnapshot: evidence },
    }));

    assert.throws(() => assertCampaignDraftSafety({
      status: 'ACTIVE',
      autoSend: true,
      aiMetadata: { aiEvidenceSnapshot: evidence },
    }), AiQualityError);
  });
});
