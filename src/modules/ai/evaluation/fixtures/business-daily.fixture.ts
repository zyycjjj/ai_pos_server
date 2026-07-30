import { CampaignStatus, ProductAvailabilityStatus } from '@prisma/client';

import type { BusinessDailyRawData } from '../../business-daily/business-daily.repository';
import type { BusinessDailyMetrics, BusinessDailyRange, BusinessDailyReport } from '../../business-daily/business-daily.types';

export const evaluationRange: BusinessDailyRange = {
  from: '2026-07-30',
  to: '2026-07-30',
  timezone: 'Asia/Shanghai',
  preset: 'today',
  start: new Date('2026-07-29T16:00:00.000Z'),
  end: new Date('2026-07-30T15:59:59.999Z'),
};

export function businessDailyRawFixture(): BusinessDailyRawData {
  return {
    store: { id: 'store_eval', name: 'Eval Store', currency: 'USD' },
    orders: [
      {
        id: 'order_eval_1',
        subtotal: 42,
        total: 38,
        promotionDiscountAmount: 2,
        manualDiscountAmount: 2,
        orderType: 'DINE_IN',
        tableId: 'table_eval_1',
        openedAt: new Date('2026-07-30T02:00:00.000Z'),
        closedAt: new Date('2026-07-30T02:34:00.000Z'),
        table: { id: 'table_eval_1', name: 'T1' },
        customerId: 'customer_eval_1',
        customer: { id: 'customer_eval_1', name: 'Ada', phone: '+14155550000', orderCount: 3 },
        items: [{ productId: 'product_eval_1', productNameSnapshot: 'Latte', quantity: 2, lineTotal: 18, modifiers: [{ name: 'Oat' }] }],
      },
      {
        id: 'order_eval_2',
        subtotal: 28,
        total: 28,
        promotionDiscountAmount: 0,
        manualDiscountAmount: 0,
        orderType: 'TAKEAWAY',
        tableId: null,
        openedAt: null,
        closedAt: null,
        table: null,
        customerId: null,
        customer: null,
        items: [{ productId: 'product_eval_2', productNameSnapshot: 'Cookie', quantity: 1, lineTotal: 5, modifiers: [] }],
      },
    ],
    cancelledTableOrders: [],
    refunds: [{ id: 'refund_eval_1', amount: 6, order: { id: 'order_eval_1' } }],
    products: [
      { id: 'product_eval_1', name: 'Latte', isActive: true, availabilityStatus: ProductAvailabilityStatus.AVAILABLE },
      { id: 'product_eval_2', name: 'Cookie', isActive: true, availabilityStatus: ProductAvailabilityStatus.AVAILABLE },
      { id: 'product_eval_3', name: 'Seasonal Tea', isActive: true, availabilityStatus: ProductAvailabilityStatus.SOLD_OUT },
    ],
    customers: [
      { id: 'customer_eval_1', name: 'Ada', phone: '+14155550000', createdAt: new Date('2026-07-20T00:00:00.000Z'), totalSpend: 120, orderCount: 3, lastOrderAt: new Date('2026-07-30T02:00:00.000Z'), pointsBalance: 20, status: 'ACTIVE' },
      { id: 'customer_eval_2', name: 'Ben', phone: '+14155550001', createdAt: new Date('2026-05-01T00:00:00.000Z'), totalSpend: 80, orderCount: 2, lastOrderAt: new Date('2026-06-01T00:00:00.000Z'), pointsBalance: 5, status: 'ACTIVE' },
    ],
    pointLedgers: [{ id: 'ledger_eval_1', points: 10 }],
    campaigns: [{ id: 'campaign_eval_1', name: 'Lunch', status: CampaignStatus.ACTIVE, usageCount: 3, usageLimit: 10, discountTotal: 6 }],
    kitchenTickets: [
      { id: 'ticket_eval_1', stationId: 'station_eval_1', status: 'NEW', urgent: true, createdAt: new Date(Date.now() - 45 * 60_000), startedAt: null, readyAt: null, station: { id: 'station_eval_1', name: 'Hot', overdueMinutes: 10 }, order: { id: 'order_eval_1', table: { id: 'table_eval_1', name: 'T1' } } },
    ],
    auditLogs: [{ id: 'audit_eval_1', action: 'MANAGER_APPROVAL', approvedById: 'manager_eval', reason: 'discount approval' }],
    cashOutMovements: [],
    soldOutProducts: [{ id: 'product_eval_3', name: 'Seasonal Tea', isActive: true, availabilityStatus: ProductAvailabilityStatus.SOLD_OUT }],
    inactiveProducts: [],
    activeCampaigns: [{ id: 'campaign_eval_1', name: 'Lunch', status: CampaignStatus.ACTIVE, usageCount: 3, usageLimit: 10, discountTotal: 6 }],
  } as unknown as BusinessDailyRawData;
}

export function businessDailyReportFixture(overrides: Partial<BusinessDailyReport> = {}): BusinessDailyReport {
  const metrics = metricsFixture();
  const report: BusinessDailyReport = {
    range: { from: evaluationRange.from, to: evaluationRange.to, timezone: evaluationRange.timezone, preset: evaluationRange.preset },
    summary: { text: 'Net sales were positive with a kitchen SLA risk.', evidenceIds: ['ev_sales'] },
    highlights: [{ text: 'Latte led product sales.', evidenceIds: ['ev_product'] }],
    risks: [{ text: 'One kitchen ticket is overdue.', evidenceIds: ['ev_kitchen'] }],
    metrics,
    evidence: [
      { id: 'ev_sales', type: 'METRIC', title: 'Net sales', value: metrics.sales.netSales },
      { id: 'ev_product', type: 'PRODUCT', title: 'Top product: Latte', value: 18, refId: 'product_eval_1' },
      { id: 'ev_customer', type: 'CUSTOMER', title: 'Dormant customers', value: 1 },
      { id: 'ev_campaign', type: 'CAMPAIGN', title: 'Campaign usage', value: 3 },
      { id: 'ev_kitchen', type: 'KITCHEN', title: 'Kitchen ticket health', value: 1 },
    ],
    recommendations: [{ id: 'rec_threshold', type: 'CAMPAIGN', priority: 'MEDIUM', title: 'Create threshold campaign draft', reason: 'AOV can be nudged safely.', evidenceIds: ['ev_sales'], action: { kind: 'CREATE_CAMPAIGN_DRAFT', label: 'Create draft', campaignTemplate: 'THRESHOLD_DISCOUNT' } }],
    generatedBy: 'evaluation',
    fallback: true,
    generatedAt: '2026-07-30T00:00:00.000Z',
  };
  return { ...report, ...overrides };
}

export function metricsFixture(): BusinessDailyMetrics {
  return {
    sales: { grossSales: 70, netSales: 60, refundTotal: 6, discountTotal: 4, promotionDiscountTotal: 2, manualDiscountTotal: 2, orderCount: 2, averageOrderValue: 30 },
    product: { topProducts: [{ productId: 'product_eval_1', name: 'Latte', quantitySold: 2, netSales: 18 }], lowSellingProducts: [{ productId: 'product_eval_2', name: 'Cookie', quantitySold: 1, netSales: 5 }], soldOutProducts: [{ productId: 'product_eval_3', name: 'Seasonal Tea' }], inactiveProducts: [], productsWithHighModifierUsage: [] },
    customer: { newCustomerCount: 0, repeatCustomerCount: 1, repeatRate: 0.5, topCustomers: [{ customerId: 'customer_eval_1', name: 'Ada', phone: '+14155550000', totalSpend: 120, orderCount: 3 }], dormantCustomers: [{ customerId: 'customer_eval_2', name: 'Ben', phone: '+14155550001', lastOrderAt: '2026-06-01T00:00:00.000Z' }], loyaltyPointsIssued: 10 },
    campaign: { activeCampaignCount: 1, campaignUsageCount: 3, campaignDiscountTotal: 6, topCampaigns: [{ campaignId: 'campaign_eval_1', name: 'Lunch', usageCount: 3, discountTotal: 6 }], campaignsNearUsageLimit: [] },
    kitchen: { ticketCount: 1, readyTicketCount: 0, cancelledTicketCount: 0, overdueTicketCount: 1, averageWaitMinutes: 45, averageCookMinutes: 0, topOverdueStations: [{ stationId: 'station_eval_1', name: 'Hot', overdueTicketCount: 1 }], urgentTicketCount: 1 },
    table: { dineInOrderCount: 1, tableOrderCount: 1, averageTableDuration: 34, topTablesBySales: [{ tableId: 'table_eval_1', name: 'T1', sales: 38, orderCount: 1 }], cancelledTableOrderCount: 0 },
    refundApproval: { refundCount: 1, refundTotal: 6, managerApprovalCount: 1, voidCount: 0, cashOutCount: 0, manualDiscountApprovalCount: 1 },
  };
}
