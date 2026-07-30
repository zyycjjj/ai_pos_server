import type { BusinessQueryIntent } from './business-query.types';

const unsupportedPatterns = [
  /sql|database|drop table|delete .*data|删除.*数据|清空|reset/i,
  /refund .*now|execute refund|自动退款|帮我退款|作废.*订单/i,
  /weather|天气|股票|股价|写代码|code/i,
  /其他门店|别的门店|another store|other store/i,
  /员工隐私|密码|password|薪资|salary/i,
];

const rules: Array<{ intent: BusinessQueryIntent; patterns: RegExp[] }> = [
  { intent: 'REFUND_ANALYSIS', patterns: [/退款|refund|退单|退了/i] },
  { intent: 'APPROVAL_ANALYSIS', patterns: [/审批|主管|manager approval|approval|手工折扣|manual discount|cash out|取出现金|现金取出/i] },
  { intent: 'KITCHEN_ANALYSIS', patterns: [/后厨|厨房|出餐|档口|超时|kitchen|station|overdue|urgent|慢/i] },
  { intent: 'TABLE_ANALYSIS', patterns: [/桌台|堂食|翻台|table|dine.?in|dining/i] },
  { intent: 'CAMPAIGN_ANALYSIS', patterns: [/活动|促销|优惠|campaign|promotion|promo|折扣.*活动/i] },
  { intent: 'CUSTOMER_ANALYSIS', patterns: [/顾客|客户|复购|沉睡|召回|customer|repeat|dormant|reactivation|loyalty/i] },
  { intent: 'PRODUCT_ANALYSIS', patterns: [/商品|产品|卖得|最好|最差|滞销|估清|product|menu item|sold.?out|top product/i] },
  { intent: 'SALES_ANALYSIS', patterns: [/销售|营业额|客单价|订单数|sales|revenue|aov|average order|order count/i] },
];

export function classifyBusinessQueryIntent(question: string): BusinessQueryIntent {
  const normalized = question.trim();
  if (!normalized) return 'UNSUPPORTED';
  if (unsupportedPatterns.some((pattern) => pattern.test(normalized))) return 'UNSUPPORTED';
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) return rule.intent;
  }
  if (/今天|本周|整体|问题|关注|怎么样|summary|business|overall|老板/i.test(normalized)) return 'GENERAL_BUSINESS_SUMMARY';
  return 'GENERAL_BUSINESS_SUMMARY';
}
