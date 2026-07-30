import { Injectable } from '@nestjs/common';

import { toMoneyNumber } from '@/common/utils/money';

import type { BusinessDailyReport } from '../business-daily/business-daily.types';
import type { BusinessQueryEvidence, BusinessQueryIntent } from '../business-query/business-query.types';
import { BusinessQueryDrilldown } from '../business-query/business-query-drilldown';
import type { AiPlaybookDefinition, AiPlaybookEvidence, AiPlaybookType } from './playbooks.types';

@Injectable()
export class PlaybookEvidenceService {
  constructor(private readonly drilldown: BusinessQueryDrilldown) {}

  async collect(input: {
    storeId: string;
    definition: AiPlaybookDefinition;
    current: BusinessDailyReport;
    previous: BusinessDailyReport;
    range: Parameters<BusinessQueryDrilldown['expand']>[0]['range'];
  }): Promise<AiPlaybookEvidence[]> {
    const base = this.baseEvidence(input.definition.type, input.current, input.previous);
    const expanded = await this.drilldown.expand({ storeId: input.storeId, intent: drilldownIntent(input.definition.type), range: input.range });
    return dedupe([...base, ...expanded]);
  }

  private baseEvidence(type: AiPlaybookType, current: BusinessDailyReport, previous: BusinessDailyReport): AiPlaybookEvidence[] {
    const evidence: AiPlaybookEvidence[] = [];
    const add = (id: string, evidenceType: BusinessQueryEvidence['type'], title: string, value: unknown, detail?: Record<string, unknown>, refId?: string | null) => {
      evidence.push({
        id,
        type: evidenceType,
        title,
        value: typeof value === 'number' || typeof value === 'string' || value === null ? value : null,
        refId,
        detail: { ...detail, raw: value },
        source: { report: 'ai_playbook', range: current.range },
      });
    };

    const sales = current.metrics.sales;
    const previousSales = previous.metrics.sales;
    add('playbook_sales_net', 'METRIC', 'Current net sales', sales.netSales, { grossSales: sales.grossSales, orderCount: sales.orderCount });
    add('playbook_sales_previous', 'TREND', 'Previous net sales', previousSales.netSales, { changeAmount: money(sales.netSales - previousSales.netSales), changeRate: changeRate(sales.netSales, previousSales.netSales) });
    add('playbook_order_count', 'METRIC', 'Current order count', sales.orderCount, { previousOrderCount: previousSales.orderCount, changeAmount: sales.orderCount - previousSales.orderCount });
    add('playbook_aov', 'METRIC', 'Average order value', sales.averageOrderValue, { previousAverageOrderValue: previousSales.averageOrderValue, changeAmount: money(sales.averageOrderValue - previousSales.averageOrderValue) });
    add('playbook_refund_total', 'REFUND', 'Current refunds', sales.refundTotal, { refundCount: current.metrics.refundApproval.refundCount, refundRate: sales.grossSales > 0 ? money(sales.refundTotal / sales.grossSales) : 0 });
    add('playbook_refund_previous', 'TREND', 'Previous refunds', previousSales.refundTotal, { previousRefundCount: previous.metrics.refundApproval.refundCount, changeAmount: money(sales.refundTotal - previousSales.refundTotal) });
    add('playbook_manager_approval', 'APPROVAL', 'Manager approvals', current.metrics.refundApproval.managerApprovalCount, { refundCount: current.metrics.refundApproval.refundCount, voidCount: current.metrics.refundApproval.voidCount });
    add('playbook_top_products', 'PRODUCT', 'Top products', current.metrics.product.topProducts[0]?.netSales ?? 0, { topProducts: current.metrics.product.topProducts });
    add('playbook_low_products', 'PRODUCT', 'Low-selling products', current.metrics.product.lowSellingProducts[0]?.quantitySold ?? 0, { lowSellingProducts: current.metrics.product.lowSellingProducts }, current.metrics.product.lowSellingProducts[0]?.productId ?? null);
    add('playbook_product_availability', 'PRODUCT', 'Product availability', current.metrics.product.soldOutProducts.length + current.metrics.product.inactiveProducts.length, { soldOutProducts: current.metrics.product.soldOutProducts, inactiveProducts: current.metrics.product.inactiveProducts });
    add('playbook_table_orders', 'TABLE', 'Table and dine-in orders', current.metrics.table.tableOrderCount, { dineInOrderCount: current.metrics.table.dineInOrderCount, topTablesBySales: current.metrics.table.topTablesBySales });
    add('playbook_repeat_rate', 'CUSTOMER', 'Customer repeat rate', current.metrics.customer.repeatRate, { repeatCustomerCount: current.metrics.customer.repeatCustomerCount, newCustomerCount: current.metrics.customer.newCustomerCount });
    add('playbook_dormant_customers', 'CUSTOMER', 'Dormant customers', current.metrics.customer.dormantCustomers.length, { dormantCustomers: current.metrics.customer.dormantCustomers });
    add('playbook_top_customers', 'CUSTOMER', 'Top customers', current.metrics.customer.topCustomers[0]?.totalSpend ?? 0, { topCustomers: current.metrics.customer.topCustomers }, current.metrics.customer.topCustomers[0]?.customerId ?? null);
    add('playbook_kitchen_sla', 'KITCHEN', 'Kitchen SLA', current.metrics.kitchen.overdueTicketCount, { ticketCount: current.metrics.kitchen.ticketCount, urgentTicketCount: current.metrics.kitchen.urgentTicketCount, averageWaitMinutes: current.metrics.kitchen.averageWaitMinutes, averageCookMinutes: current.metrics.kitchen.averageCookMinutes });
    add('playbook_overdue_stations', 'KITCHEN', 'Overdue stations', current.metrics.kitchen.topOverdueStations[0]?.overdueTicketCount ?? 0, { topOverdueStations: current.metrics.kitchen.topOverdueStations }, current.metrics.kitchen.topOverdueStations[0]?.stationId ?? null);

    return evidence.filter((item) => usefulFor(type, item));
  }
}

function drilldownIntent(type: AiPlaybookType): BusinessQueryIntent {
  if (type === 'REFUND_SPIKE_DIAGNOSIS') return 'REFUND_ANALYSIS';
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return 'KITCHEN_ANALYSIS';
  if (type === 'DORMANT_CUSTOMER_REACTIVATION' || type === 'TOP_CUSTOMER_RETENTION') return 'CUSTOMER_ANALYSIS';
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return 'PRODUCT_ANALYSIS';
  return 'SALES_ANALYSIS';
}

function usefulFor(type: AiPlaybookType, item: BusinessQueryEvidence) {
  if (type === 'REFUND_SPIKE_DIAGNOSIS') return ['REFUND', 'APPROVAL', 'ORDER', 'PRODUCT', 'METRIC', 'TREND'].includes(item.type);
  if (type === 'SALES_DROP_DIAGNOSIS') return ['METRIC', 'TREND', 'PRODUCT', 'TABLE', 'CUSTOMER'].includes(item.type);
  if (type === 'KITCHEN_OVERDUE_DIAGNOSIS') return ['KITCHEN', 'PRODUCT', 'METRIC'].includes(item.type);
  if (type === 'DORMANT_CUSTOMER_REACTIVATION' || type === 'TOP_CUSTOMER_RETENTION') return ['CUSTOMER', 'CAMPAIGN', 'METRIC'].includes(item.type);
  if (type === 'LOW_SELLING_PRODUCT_PROMO') return ['PRODUCT', 'METRIC', 'SALES'].includes(item.type);
  return true;
}

function dedupe(items: AiPlaybookEvidence[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 24);
}

function changeRate(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 1 : 0;
  return money((current - previous) / previous);
}

function money(value: number) {
  return toMoneyNumber(value);
}
