import { CampaignRecommendationFallback } from '../../campaign-recommendation/campaign-recommendation-fallback';
import type { AiCampaignRecommendationResponse } from '../../campaign-recommendation/campaign-recommendation.types';
import { businessDailyReportFixture } from './business-daily.fixture';

export function campaignRecommendationFixture(): AiCampaignRecommendationResponse {
  const report = businessDailyReportFixture();
  return {
    range: report.range,
    items: new CampaignRecommendationFallback().generate(report),
    evidence: report.evidence,
    fallback: true,
    generatedAt: '2026-07-30T00:00:00.000Z',
  };
}
