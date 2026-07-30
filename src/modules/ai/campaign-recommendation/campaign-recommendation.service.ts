import { BadRequestException, Injectable } from '@nestjs/common';

import { StoreContextService } from '@/common/store-context.service';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { collectEvidenceRefNodes } from '@/modules/ai/guardrails/ai-evidence-validator';
import { validateAiOutput } from '@/modules/ai/guardrails/ai-output-validator';

import { BusinessDailyService, resolveBusinessDailyRange } from '../business-daily/business-daily.service';
import type { BusinessDailyQueryDto, CreateCampaignDraftFromRecommendationDto } from '../business-daily/dto/business-daily.dto';
import { createCampaignDraftFromRecommendation } from './campaign-draft-mapper';
import { CampaignRecommendationFallback } from './campaign-recommendation-fallback';
import { evidenceSnapshot, validateCampaignRecommendations } from './campaign-recommendation-validator';
import type { AiCampaignRecommendationResponse } from './campaign-recommendation.types';

@Injectable()
export class CampaignRecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContextService,
    private readonly businessDaily: BusinessDailyService,
    private readonly fallback: CampaignRecommendationFallback,
  ) {}

  async recommendations(query: BusinessDailyQueryDto, currentUser: AuthRequestUser): Promise<AiCampaignRecommendationResponse> {
    const report = await this.businessDaily.getBusinessDaily(query, currentUser);
    const items = validateCampaignRecommendations(this.fallback.generate(report), report.evidence, query.type);
    const response = {
      range: report.range,
      items,
      evidence: report.evidence,
      fallback: report.fallback,
      generatedAt: new Date().toISOString(),
    };
    return validateCampaignRecommendationResponse(response).ok ? response : {
      ...response,
      items: [],
      fallback: true,
    };
  }

  async createDraft(dto: CreateCampaignDraftFromRecommendationDto, currentUser: AuthRequestUser) {
    const query = {
      preset: dto.preset,
      from: dto.from,
      to: dto.to,
      timezone: dto.timezone,
      type: dto.recommendationType,
    } satisfies BusinessDailyQueryDto;
    resolveBusinessDailyRange(query);
    const response = await this.recommendations(query, currentUser);
    const recommendation = response.items.find((item) => item.id === dto.recommendationId);
    if (!recommendation) {
      throw new BadRequestException('AI recommendation is not valid for the active store and selected range.');
    }
    if (recommendation.action.kind !== 'CREATE_CAMPAIGN_DRAFT' || !recommendation.draftPayload) {
      throw new BadRequestException('AI recommendation does not support campaign draft creation.');
    }
    const snapshot = evidenceSnapshot(response.evidence, recommendation.evidenceIds);
    if (snapshot.length !== recommendation.evidenceIds.length) {
      throw new BadRequestException('AI recommendation evidence is incomplete.');
    }
    return createCampaignDraftFromRecommendation({
      prisma: this.prisma,
      storeId: this.storeContext.getStoreId(),
      currentUser,
      recommendation,
      evidence: snapshot,
      adjustments: dto.adjustments,
    });
  }
}

export function validateCampaignRecommendationResponse(response: AiCampaignRecommendationResponse) {
  const base = validateAiOutput('AI Campaign Recommendation', response, {
    requiredFields: ['range', 'items', 'evidence', 'generatedAt'],
    arrayFields: ['items', 'evidence'],
    evidenceRequired: response.evidence.length > 0,
    evidenceNodes: collectEvidenceRefNodes({ items: response.items }),
  });
  const draftIssues = response.items
    .filter((item) => item.action.kind === 'CREATE_CAMPAIGN_DRAFT' && !item.draftPayload)
    .map((item) => ({ path: `items.${item.id}.draftPayload`, message: 'Campaign draft action requires draftPayload.' }));
  return { ok: base.ok && draftIssues.length === 0, value: response, issues: [...base.issues, ...draftIssues] };
}
