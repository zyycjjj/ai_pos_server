import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BossDashboardFallback } from '../boss-dashboard/boss-dashboard-fallback';
import { validateBossDashboardReport, validateWeeklyInsightReport } from '../boss-dashboard/boss-dashboard.service';
import { BusinessDailyFallback } from '../business-daily/business-daily-fallback';
import { validateBusinessDailyReport } from '../business-daily/business-daily.service';
import { BusinessQueryFallback } from '../business-query/business-query-fallback';
import { validateBusinessQueryResponse } from '../business-query/business-query.service';
import { CampaignRecommendationFallback } from '../campaign-recommendation/campaign-recommendation-fallback';
import { validateCampaignRecommendationResponse } from '../campaign-recommendation/campaign-recommendation.service';
import { PLAYBOOK_DEFINITIONS } from '../playbooks/playbook-definitions';
import { PlaybookFallback } from '../playbooks/playbook-fallback';
import { validatePlaybookResult } from '../playbooks/playbooks.service';
import { validateSuggestedActions } from '../guardrails/ai-suggested-action-validator';
import { businessDailyRawFixture, businessDailyReportFixture, evaluationRange, metricsFixture } from './fixtures/business-daily.fixture';
import { bossDashboardFixture, bossRangeFixture, weeklyInsightFixture } from './fixtures/boss-dashboard.fixture';
import { businessQueryFixture } from './fixtures/business-query.fixture';
import { campaignRecommendationFixture } from './fixtures/campaign-recommendation.fixture';
import { playbookEvidenceFixture, playbookFixture } from './fixtures/playbook.fixture';

describe('AI evaluation harness', () => {
  it('keeps fallback shapes valid for Business Daily, Campaign Recommendation, Boss Dashboard, Business Query, and Playbook', () => {
    const daily = new BusinessDailyFallback().generate(evaluationRange, businessDailyRawFixture(), { generatedBy: 'test', providerLabel: 'fallback', fallback: true });
    assert.equal(validateBusinessDailyReport(daily).ok, true);

    const campaignResponse = campaignRecommendationFixture();
    assert.equal(validateCampaignRecommendationResponse(campaignResponse).ok, true);

    const boss = bossDashboardFixture();
    assert.equal(validateBossDashboardReport(boss).ok, true);
    assert.equal(validateWeeklyInsightReport(weeklyInsightFixture()).ok, true);

    const queryFallback = new BusinessQueryFallback();
    const queryEvidence = businessQueryFixture().evidence;
    const answer = queryFallback.answer({ question: 'sales?', intent: 'SALES_ANALYSIS', daily: businessDailyReportFixture(), evidence: queryEvidence });
    const query = { ...businessQueryFixture(), answer, suggestedActions: queryFallback.suggestedActions('SALES_ANALYSIS', queryEvidence) };
    assert.equal(validateBusinessQueryResponse(query).ok, true);

    const playbook = playbookFixture();
    assert.equal(validatePlaybookResult(playbook).ok, true);
  });

  it('requires evidence when fallback data exists and verifies evidenceIds across modules', () => {
    const report = businessDailyReportFixture();
    assert.ok(report.evidence.length > 0);
    assert.equal(validateBusinessDailyReport(report).ok, true);

    const campaignResponse = {
      ...campaignRecommendationFixture(),
      items: new CampaignRecommendationFallback().generate(report),
    };
    assert.equal(validateCampaignRecommendationResponse(campaignResponse).ok, true);

    const boss = new BossDashboardFallback().buildDashboard({ range: bossRangeFixture, current: metricsFixture(), previous: metricsFixture(), fallback: true });
    assert.equal(validateBossDashboardReport(boss).ok, true);

    const broken = { ...businessQueryFixture(), answer: { ...businessQueryFixture().answer, details: [{ title: 'Bad', text: 'Missing ref', evidenceIds: ['other_store_ev'] }] } };
    assert.equal(validateBusinessQueryResponse(broken).ok, false);
  });

  it('validates suggestedActions and campaign draft actions as safe', () => {
    const query = businessQueryFixture();
    assert.equal(validateSuggestedActions(query.suggestedActions, query.evidence).ok, true);
    assert.equal(validateSuggestedActions([{ kind: 'VIEW_REPORT', label: 'Bad external', href: 'https://example.com', evidenceIds: ['query_ev_sales_net'] }], query.evidence).ok, false);

    const playbook = playbookFixture();
    const campaignDraftActions = playbook.recommendedActions.filter((item) => item.actionType === 'CREATE_CAMPAIGN_DRAFT');
    assert.ok(campaignDraftActions.length > 0);
    for (const action of campaignDraftActions) {
      assert.equal(action.targetUrl, '/campaigns');
      assert.ok(action.evidenceIds.every((id) => playbook.evidence.some((item) => item.id === id)));
      assert.ok(action.payload?.draftPayload);
    }
  });

  it('validates every playbook fallback run', () => {
    const fallback = new PlaybookFallback();
    const current = businessDailyReportFixture();
    const previous = businessDailyReportFixture();
    for (const definition of PLAYBOOK_DEFINITIONS) {
      const result = fallback.generate({ runId: `run_${definition.type}`, definition, current, previous, evidence: playbookEvidenceFixture() });
      assert.equal(validatePlaybookResult(result).ok, true, definition.type);
    }
  });
});
