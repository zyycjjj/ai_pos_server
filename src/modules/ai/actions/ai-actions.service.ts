import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiActionStatus, AiActionType, CampaignStatus, CampaignType, CustomerEligibilityMode, Prisma, PromotionStackingPolicy } from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthRequestUser } from '@/modules/auth/auth.types';

import { AiActionNormalizer } from './ai-action-normalizer';
import { AiActionsRepository } from './ai-actions.repository';
import type { AiActionListResponse } from './ai-actions.types';
import { presentAiAction } from './ai-actions.types';
import type { CreateAiActionDto, ListAiActionsQueryDto, UpdateAiActionDto } from './dto/ai-action.dto';

@Injectable()
export class AiActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContextService,
    private readonly repository: AiActionsRepository,
    private readonly normalizer: AiActionNormalizer,
  ) {}

  async create(dto: CreateAiActionDto, currentUser: AuthRequestUser) {
    const normalized = this.normalizer.normalize(dto);
    const item = await this.repository.create(this.storeContext.getStoreId(), currentUser.id, normalized);
    return presentAiAction(item);
  }

  async list(query: ListAiActionsQueryDto): Promise<AiActionListResponse> {
    const storeId = this.storeContext.getStoreId();
    const [items, summary] = await Promise.all([
      this.repository.list(storeId, { ...query, take: clampTake(query.take) }),
      this.repository.summary(storeId),
    ]);
    return { items: items.map(presentAiAction), summary };
  }

  async update(id: string, dto: UpdateAiActionDto, currentUser: AuthRequestUser) {
    const storeId = this.storeContext.getStoreId();
    const item = await this.repository.findForStore(storeId, id);
    if (!item) throw new NotFoundException('AI action item not found.');
    if (!isAllowedTransition(item.status, dto.status)) throw new BadRequestException(`Cannot change AI action status from ${item.status} to ${dto.status}.`);
    const data: Prisma.AiActionItemUpdateInput = {
      status: dto.status,
      handledBy: { connect: { id: currentUser.id } },
      handledAt: new Date(),
      handledNote: dto.note?.trim().slice(0, 1000) || null,
      dismissReason: dto.status === AiActionStatus.DISMISSED ? (dto.dismissReason?.trim().slice(0, 1000) || dto.note?.trim().slice(0, 1000) || 'Dismissed by manager.') : null,
    };
    if (dto.status === AiActionStatus.OPEN) {
      data.handledBy = { disconnect: true };
      data.handledAt = null;
      data.handledNote = dto.note?.trim().slice(0, 1000) || null;
      data.dismissReason = null;
    }
    const updated = await this.prisma.aiActionItem.update({ where: { id: item.id }, data });
    return presentAiAction(updated);
  }

  async createCampaignDraft(id: string, currentUser: AuthRequestUser) {
    const storeId = this.storeContext.getStoreId();
    const item = await this.repository.findForStore(storeId, id);
    if (!item) throw new NotFoundException('AI action item not found.');
    if (item.actionType !== AiActionType.CREATE_CAMPAIGN_DRAFT) throw new BadRequestException('AI action does not support campaign draft creation.');
    if (item.status !== AiActionStatus.OPEN) throw new BadRequestException('Only OPEN AI campaign draft actions can create a draft.');
    const payload = readObject(item.payloadJson);
    const spec = campaignSpecFromPayload(item.title, item.reason, payload);
    const startsAt = startOfTomorrow();
    const endsAt = addDays(startsAt, spec.durationDays);
    const result = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          storeId,
          name: spec.name,
          goal: spec.goal,
          status: CampaignStatus.DRAFT,
          type: spec.type,
          discountType: spec.discountType,
          discountValue: spec.discountValue,
          thresholdAmount: spec.thresholdAmount,
          promoCode: spec.promoCode,
          productId: spec.productId,
          categoryName: spec.categoryName,
          customerEligibilityMode: spec.customerEligibilityMode,
          stackingPolicy: PromotionStackingPolicy.BEST_ONLY,
          startsAt,
          endsAt,
          usageLimit: spec.usageLimit,
          timeWindow: spec.timeWindow,
          bannerCopy: spec.bannerCopy,
          staffMessage: spec.staffMessage,
          createdById: currentUser.id,
          structuredJson: {
            source: 'ai_action_workspace',
            aiActionId: item.id,
            aiActionSourceType: item.sourceType,
            aiActionSourceId: item.sourceId,
            aiActionEvidenceSnapshot: item.evidenceSnapshotJson ?? [],
            aiActionPayload: item.payloadJson ?? {},
            createdAt: new Date().toISOString(),
          } satisfies Prisma.InputJsonObject,
        },
      });
      const updated = await tx.aiActionItem.update({
        where: { id: item.id },
        data: {
          status: AiActionStatus.DONE,
          handledByUserId: currentUser.id,
          handledAt: new Date(),
          handledNote: 'Campaign draft created from AI action workspace.',
          resultJson: { campaignId: campaign.id, status: campaign.status, name: campaign.name } satisfies Prisma.InputJsonObject,
        },
      });
      return { campaign, action: updated };
    });
    return {
      campaign: {
        id: result.campaign.id,
        name: result.campaign.name,
        status: result.campaign.status,
        type: result.campaign.type,
        discountType: result.campaign.discountType,
        discountValue: result.campaign.discountValue,
        thresholdAmount: result.campaign.thresholdAmount ? Number(result.campaign.thresholdAmount) : null,
        promoCode: result.campaign.promoCode,
        productId: result.campaign.productId,
        startsAt: result.campaign.startsAt?.toISOString() ?? null,
        endsAt: result.campaign.endsAt?.toISOString() ?? null,
        createdAt: result.campaign.createdAt.toISOString(),
      },
      action: presentAiAction(result.action),
    };
  }
}

function isAllowedTransition(from: AiActionStatus, to: AiActionStatus) {
  if (from === to) return true;
  if (from === AiActionStatus.OPEN && (to === AiActionStatus.DONE || to === AiActionStatus.DISMISSED)) return true;
  if ((from === AiActionStatus.DONE || from === AiActionStatus.DISMISSED) && to === AiActionStatus.OPEN) return true;
  return false;
}

function clampTake(value: unknown) {
  const parsed = Number(value ?? 50);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : 50;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function campaignSpecFromPayload(title: string, reason: string | null, payload: Record<string, unknown>) {
  const draft = readObject(readObject(payload.draftPayload).campaignType ? payload.draftPayload : payload);
  const type = enumValue(CampaignType, draft.campaignType) ?? enumValue(CampaignType, draft.type) ?? CampaignType.ORDER_DISCOUNT;
  const customerEligibilityMode = enumValue(CustomerEligibilityMode, draft.customerEligibilityMode) ?? CustomerEligibilityMode.ALL_CUSTOMERS;
  const discountType = text(draft.discountType, 40) ?? 'percentage';
  const discountValue = clampNumber(number(draft.discountValue) ?? 10, 0, 1000);
  const thresholdAmount = number(draft.thresholdAmount) ?? number(draft.threshold) ?? (type === CampaignType.THRESHOLD_DISCOUNT ? 50 : null);
  const durationDays = clampNumber(number(draft.durationDays) ?? number(draft.suggestedDurationDays) ?? 7, 1, 30);
  return {
    name: text(draft.title, 120) ?? text(draft.name, 120) ?? `${title.slice(0, 100)} Draft`,
    goal: text(draft.goal, 240) ?? reason ?? 'AI action workspace campaign draft.',
    type,
    discountType,
    discountValue,
    thresholdAmount,
    promoCode: text(draft.promoCode, 40)?.toUpperCase() ?? null,
    productId: text(draft.productId, 120),
    categoryName: text(draft.categoryName, 120),
    customerEligibilityMode,
    usageLimit: number(draft.usageLimit),
    timeWindow: text(draft.timeWindow, 120),
    bannerCopy: text(draft.bannerCopy, 240) ?? 'Review this AI suggested offer before activation.',
    staffMessage: text(draft.staffMessage, 240) ?? 'Manager review is required before activating this draft.',
    durationDays,
  };
}

function enumValue<T extends Record<string, string>>(enumeration: T, value: unknown): T[keyof T] | null {
  return typeof value === 'string' && Object.values(enumeration).includes(value) ? value as T[keyof T] : null;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function startOfTomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
