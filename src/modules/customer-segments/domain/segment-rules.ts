export type CustomerSegmentRule = {
  minOrderCount?: number;
  maxOrderCount?: number;
  minTotalSpend?: number;
  maxTotalSpend?: number;
  lastOrderBeforeDays?: number;
  lastOrderWithinDays?: number;
  minPointsBalance?: number;
  maxPointsBalance?: number;
};

export class InvalidCustomerSegmentRuleError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const RULE_KEYS = [
  'minOrderCount',
  'maxOrderCount',
  'minTotalSpend',
  'maxTotalSpend',
  'lastOrderBeforeDays',
  'lastOrderWithinDays',
  'minPointsBalance',
  'maxPointsBalance',
] as const;

export function parseCustomerSegmentRule(value: unknown): CustomerSegmentRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidCustomerSegmentRuleError('Customer segment rule must be an object.');
  }
  const input = value as Record<string, unknown>;
  const unknownKeys = Object.keys(input).filter((key) => !RULE_KEYS.includes(key as typeof RULE_KEYS[number]));
  if (unknownKeys.length > 0) {
    throw new InvalidCustomerSegmentRuleError(`Unsupported customer segment rule keys: ${unknownKeys.join(', ')}`);
  }
  const rule: CustomerSegmentRule = {};
  for (const key of RULE_KEYS) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const numberValue = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      throw new InvalidCustomerSegmentRuleError(`Customer segment rule "${key}" must be a non-negative number.`);
    }
    rule[key] = numberValue;
  }
  if (rule.minOrderCount !== undefined && rule.maxOrderCount !== undefined && rule.minOrderCount > rule.maxOrderCount) {
    throw new InvalidCustomerSegmentRuleError('minOrderCount cannot be greater than maxOrderCount.');
  }
  if (rule.minTotalSpend !== undefined && rule.maxTotalSpend !== undefined && rule.minTotalSpend > rule.maxTotalSpend) {
    throw new InvalidCustomerSegmentRuleError('minTotalSpend cannot be greater than maxTotalSpend.');
  }
  if (rule.minPointsBalance !== undefined && rule.maxPointsBalance !== undefined && rule.minPointsBalance > rule.maxPointsBalance) {
    throw new InvalidCustomerSegmentRuleError('minPointsBalance cannot be greater than maxPointsBalance.');
  }
  return rule;
}

export function matchesCustomerSegmentRule(
  rule: CustomerSegmentRule,
  customer: {
    orderCount: number;
    totalSpend: { toString(): string } | number;
    pointsBalance: number;
    lastOrderAt: Date | null;
  },
  now = new Date(),
) {
  const totalSpend = Number(customer.totalSpend);
  if (rule.minOrderCount !== undefined && customer.orderCount < rule.minOrderCount) return false;
  if (rule.maxOrderCount !== undefined && customer.orderCount > rule.maxOrderCount) return false;
  if (rule.minTotalSpend !== undefined && totalSpend < rule.minTotalSpend) return false;
  if (rule.maxTotalSpend !== undefined && totalSpend > rule.maxTotalSpend) return false;
  if (rule.minPointsBalance !== undefined && customer.pointsBalance < rule.minPointsBalance) return false;
  if (rule.maxPointsBalance !== undefined && customer.pointsBalance > rule.maxPointsBalance) return false;
  if (rule.lastOrderBeforeDays !== undefined) {
    if (!customer.lastOrderAt) return false;
    const cutoff = daysAgo(now, rule.lastOrderBeforeDays);
    if (customer.lastOrderAt > cutoff) return false;
  }
  if (rule.lastOrderWithinDays !== undefined) {
    if (!customer.lastOrderAt) return false;
    const cutoff = daysAgo(now, rule.lastOrderWithinDays);
    if (customer.lastOrderAt < cutoff) return false;
  }
  return true;
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
