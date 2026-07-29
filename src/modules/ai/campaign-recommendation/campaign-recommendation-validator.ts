import type { BusinessDailyEvidence } from '../business-daily/business-daily.types';
import type { AiCampaignRecommendation } from './campaign-recommendation.types';

export function validateCampaignRecommendations(items: AiCampaignRecommendation[], evidence: BusinessDailyEvidence[], type?: string) {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const filtered = type ? items.filter((item) => item.type === type) : items;
  return filtered
    .filter((item) => item.evidenceIds.length > 0 && item.evidenceIds.every((id) => evidenceIds.has(id)))
    .filter((item) => item.action.kind === 'NONE' || Boolean(item.draftPayload))
    .slice(0, 8);
}

export function evidenceSnapshot(evidence: BusinessDailyEvidence[], ids: string[]) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is BusinessDailyEvidence => Boolean(item));
}
