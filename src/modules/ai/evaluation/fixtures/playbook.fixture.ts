import { PLAYBOOK_DEFINITIONS } from '../../playbooks/playbook-definitions';
import { PlaybookFallback } from '../../playbooks/playbook-fallback';
import type { AiPlaybookEvidence, AiPlaybookResult } from '../../playbooks/playbooks.types';
import { businessDailyReportFixture } from './business-daily.fixture';

export function playbookEvidenceFixture(): AiPlaybookEvidence[] {
  return [
    { id: 'playbook_sales_net', type: 'METRIC', title: 'Current net sales', value: 60 },
    { id: 'playbook_sales_previous', type: 'TREND', title: 'Previous net sales', value: 80 },
    { id: 'playbook_order_count', type: 'METRIC', title: 'Order count', value: 2 },
    { id: 'playbook_aov', type: 'METRIC', title: 'AOV', value: 30 },
    { id: 'playbook_low_products', type: 'PRODUCT', title: 'Low products', value: 1, refId: 'product_eval_2' },
    { id: 'playbook_product_availability', type: 'PRODUCT', title: 'Availability', value: 1 },
    { id: 'playbook_repeat_rate', type: 'CUSTOMER', title: 'Repeat rate', value: 0.5 },
    { id: 'playbook_dormant_customers', type: 'CUSTOMER', title: 'Dormant customers', value: 1 },
    { id: 'playbook_top_customers', type: 'CUSTOMER', title: 'Top customers', value: 120, refId: 'customer_eval_1' },
    { id: 'playbook_kitchen_sla', type: 'KITCHEN', title: 'Kitchen SLA', value: 1 },
    { id: 'playbook_refund_total', type: 'REFUND', title: 'Refund total', value: 6 },
    { id: 'playbook_refund_previous', type: 'TREND', title: 'Previous refunds', value: 0 },
    { id: 'playbook_manager_approval', type: 'APPROVAL', title: 'Manager approvals', value: 1 },
  ];
}

export function playbookFixture(): AiPlaybookResult {
  return new PlaybookFallback().generate({
    runId: 'playbook_eval',
    definition: PLAYBOOK_DEFINITIONS.find((item) => item.type === 'LOW_SELLING_PRODUCT_PROMO') ?? PLAYBOOK_DEFINITIONS[0],
    current: businessDailyReportFixture(),
    previous: businessDailyReportFixture(),
    evidence: playbookEvidenceFixture(),
  });
}
