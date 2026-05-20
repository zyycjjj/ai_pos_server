import type { AiDraft } from '@prisma/client';

export function presentAiDraft(draft: AiDraft) {
  return {
    id: draft.id,
    prompt: draft.prompt,
    structuredJson: draft.structuredJson,
    status: draft.status,
    confirmedAt: draft.confirmedAt?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}
