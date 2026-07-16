import { Injectable } from '@nestjs/common';
import { PrintDocumentType } from '@prisma/client';

@Injectable()
export class EscPosRenderer {
  render(documentType: PrintDocumentType, payload: unknown) {
    const lines = this.renderLines(documentType, payload as any);
    const text = `${lines.join('\n')}\n\n\n`;
    const bytes = Buffer.concat([
      Buffer.from([0x1b, 0x40]),
      Buffer.from(text, 'utf8'),
      Buffer.from([0x1d, 0x56, 0x00]),
    ]);
    return { text, bytes };
  }

  private renderLines(documentType: PrintDocumentType, payload: any) {
    switch (documentType) {
      case PrintDocumentType.CUSTOMER_RECEIPT:
        return this.receipt(payload);
      case PrintDocumentType.KITCHEN_TICKET:
        return this.kitchenTicket(payload);
      case PrintDocumentType.REFUND_RECEIPT:
        return this.refund(payload);
      case PrintDocumentType.SHIFT_SUMMARY:
        return this.shiftSummary(payload);
      case PrintDocumentType.TEST_PAGE:
      default:
        return this.testPage(payload);
    }
  }

  private receipt(payload: any) {
    const lines = [
      center(payload.store?.name ?? 'AI-POS Store'),
      separator(),
      `Order: ${payload.order?.orderNumber ?? '-'}`,
      payload.order?.pickupNumber ? `Pickup: ${payload.order.pickupNumber}` : null,
      payload.order?.orderType ? `Type: ${payload.order.orderType}` : null,
      payload.order?.tableName ? `Table: ${payload.order.tableName}` : null,
      payload.order?.guestCount ? `Guests: ${payload.order.guestCount}` : null,
      `Date: ${formatDate(payload.order?.createdAt)}`,
      separator(),
      ...((payload.items ?? []) as any[]).flatMap((item) => [
        `${item.quantity} x ${item.name}`,
        moneyLine('  Unit', item.unitPrice),
        moneyLine('  Line', item.lineTotal),
        ...formatModifiers(item.modifiers),
      ]),
      separator(),
      moneyLine('Subtotal', payload.totals?.subtotal),
      moneyLine('Discount', payload.totals?.adjustment),
      moneyLine('Tax', payload.totals?.tax),
      moneyLine('Service', payload.totals?.serviceCharge),
      moneyLine('Tip', payload.totals?.tip),
      moneyLine('Total', payload.totals?.total),
      moneyLine('Refunds', payload.totals?.refundedTotal),
      moneyLine('Net Total', payload.totals?.netTotal ?? payload.totals?.total),
      separator(),
      ...((payload.payments ?? []) as any[]).map((payment) => moneyLine(payment.method, payment.amount)),
      payload.footer?.message ?? 'Thank you',
    ];
    return compact(lines);
  }

  private kitchenTicket(payload: any) {
    return compact([
      center(payload.ticket?.ticketNumber ?? 'KITCHEN'),
      center(payload.station?.name ?? 'Kitchen'),
      separator(),
      `Order: ${payload.order?.orderNumber ?? '-'}`,
      payload.order?.pickupNumber ? `Pickup: ${payload.order.pickupNumber}` : null,
      `Created: ${formatDate(payload.ticket?.createdAt)}`,
      separator(),
      ...((payload.items ?? []) as any[]).flatMap((item) => [
        `${item.quantity} x ${item.productName ?? item.name}`,
        ...formatModifiers(item.modifiers),
        item.notes ? `  Note: ${item.notes}` : null,
      ]),
    ]);
  }

  private refund(payload: any) {
    return compact([
      center('REFUND'),
      payload.store?.name ?? 'AI-POS Store',
      separator(),
      `Refund: ${payload.refund?.refundNumber ?? '-'}`,
      `Order: ${payload.order?.orderNumber ?? '-'}`,
      `Date: ${formatDate(payload.refund?.createdAt)}`,
      separator(),
      ...((payload.items ?? []) as any[]).map((item) => `${item.quantity} x ${item.name}  ${money(item.amount)}`),
      separator(),
      moneyLine('Refund Amount', payload.refund?.amount),
      `Reason: ${payload.refund?.reason ?? '-'}`,
    ]);
  }

  private shiftSummary(payload: any) {
    return compact([
      center('SHIFT SUMMARY'),
      payload.store?.name ?? 'AI-POS Store',
      separator(),
      `Staff: ${payload.shift?.staffName ?? '-'}`,
      `Opened: ${formatDate(payload.shift?.openedAt)}`,
      `Closed: ${formatDate(payload.shift?.closedAt)}`,
      separator(),
      moneyLine('Opening Cash', payload.shift?.openingCash),
      moneyLine('Cash Sales', payload.shift?.cashSales),
      moneyLine('Cash Refunds', payload.shift?.cashRefunds),
      moneyLine('Cash In', payload.shift?.cashIn),
      moneyLine('Cash Out', payload.shift?.cashOut),
      moneyLine('Expected', payload.shift?.expectedCash),
      moneyLine('Actual', payload.shift?.actualCash),
      moneyLine('Variance', payload.shift?.variance),
    ]);
  }

  private testPage(payload: any) {
    return compact([
      center('AI-POS TEST PRINT'),
      separator(),
      `Printer: ${payload.printer?.name ?? '-'}`,
      `Code: ${payload.printer?.code ?? '-'}`,
      `Time: ${formatDate(payload.createdAt ?? new Date().toISOString())}`,
      separator(),
      'If you can read this, the print path is alive.',
    ]);
  }
}

function separator() {
  return '-'.repeat(32);
}

function center(value: string) {
  const width = 32;
  const pad = Math.max(0, Math.floor((width - value.length) / 2));
  return `${' '.repeat(pad)}${value}`;
}

function money(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value ?? 0);
  return `$${amount.toFixed(2)}`;
}

function moneyLine(label: string, value: unknown) {
  const left = label.slice(0, 20);
  const right = money(value);
  return `${left}${' '.repeat(Math.max(1, 32 - left.length - right.length))}${right}`;
}

function formatModifiers(modifiers: unknown) {
  if (!Array.isArray(modifiers) || modifiers.length === 0) {
    return [];
  }
  return modifiers.map((modifier: any) => {
    if (typeof modifier === 'string') {
      return `  ${modifier}`;
    }
    return `  ${[modifier.groupName, modifier.optionName].filter(Boolean).join(': ')}`;
  });
}

function formatDate(value: unknown) {
  if (!value) {
    return '-';
  }
  return new Date(String(value)).toLocaleString();
}

function compact(lines: Array<string | null | undefined>) {
  return lines.filter((line): line is string => Boolean(line));
}
