import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrintDocumentType } from '@prisma/client';

import { EscPosRenderer } from './escpos.renderer';

describe('EscPosRenderer', () => {
  const renderer = new EscPosRenderer();

  it('renders customer receipt text and ESC/POS bytes', () => {
    const result = renderer.render(PrintDocumentType.CUSTOMER_RECEIPT, {
      store: { name: 'AI-POS Cafe' },
      order: { orderNumber: 'POS-1001', pickupNumber: 'A12', createdAt: '2026-07-07T10:00:00.000Z' },
      items: [{ quantity: 2, name: 'Latte', unitPrice: 4.5, lineTotal: 9, modifiers: [{ groupName: 'Milk', optionName: 'Oat' }] }],
      totals: { subtotal: 9, adjustment: 0, tax: 0.72, tip: 1, refundedTotal: 0, netTotal: 10.72 },
      payments: [{ method: 'CASH', amount: 10.72 }],
      footer: { message: 'Thank you' },
    });

    assert.match(result.text, /AI-POS Cafe/);
    assert.match(result.text, /Order: POS-1001/);
    assert.match(result.text, /Milk: Oat/);
    assert.match(result.text, /Net Total/);
    assert.equal(result.bytes[0], 0x1b);
    assert.equal(result.bytes[1], 0x40);
    assert.equal(result.bytes.at(-3), 0x1d);
    assert.equal(result.bytes.at(-2), 0x56);
  });

  it('renders kitchen ticket payload with station and modifiers', () => {
    const result = renderer.render(PrintDocumentType.KITCHEN_TICKET, {
      ticket: { ticketNumber: 'HOT-001', createdAt: '2026-07-07T10:01:00.000Z' },
      station: { name: 'Hot Kitchen' },
      order: { orderNumber: 'POS-1002', pickupNumber: 'B07' },
      items: [{ quantity: 1, productName: 'Chicken Rice', modifiers: ['Extra spicy'], notes: 'No cilantro' }],
    });

    assert.match(result.text, /HOT-001/);
    assert.match(result.text, /Hot Kitchen/);
    assert.match(result.text, /Extra spicy/);
    assert.match(result.text, /No cilantro/);
  });

  it('renders refund receipt and shift summary documents', () => {
    const refund = renderer.render(PrintDocumentType.REFUND_RECEIPT, {
      store: { name: 'AI-POS Cafe' },
      refund: { refundNumber: 'RF-1', amount: 5, reason: 'Guest changed order', createdAt: '2026-07-07T10:02:00.000Z' },
      order: { orderNumber: 'POS-1003' },
      items: [{ quantity: 1, name: 'Tea', amount: 5 }],
    });
    const shift = renderer.render(PrintDocumentType.SHIFT_SUMMARY, {
      store: { name: 'AI-POS Cafe' },
      shift: {
        staffName: 'Manager',
        openedAt: '2026-07-07T09:00:00.000Z',
        closedAt: '2026-07-07T18:00:00.000Z',
        openingCash: 200,
        cashSales: 80,
        cashRefunds: 5,
        cashIn: 20,
        cashOut: 10,
        expectedCash: 285,
        actualCash: 284,
        variance: -1,
      },
    });

    assert.match(refund.text, /REFUND/);
    assert.match(refund.text, /RF-1/);
    assert.match(refund.text, /Refund Amount/);
    assert.match(shift.text, /SHIFT SUMMARY/);
    assert.match(shift.text, /Expected/);
    assert.match(shift.text, /Variance/);
  });
});
