import type { BusinessDailyEvidence, BusinessDailyEvidenceType } from './business-daily.types';

export class EvidenceBuilder {
  private readonly items: BusinessDailyEvidence[] = [];
  private index = 1;

  add(type: BusinessDailyEvidenceType, title: string, value?: number | string | null, detail?: Record<string, unknown>, refId?: string | null) {
    const item = {
      id: `ev_${String(this.index++).padStart(3, '0')}`,
      type,
      title,
      value,
      refId,
      detail,
    };
    this.items.push(item);
    return item.id;
  }

  all() {
    return this.items;
  }
}
