import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  PrinterConnectionType,
  PrinterStatus,
  PrinterType,
  PrintDocumentType,
  PrintJobReason,
  PrintJobReferenceType,
  PrintJobStatus,
} from '@prisma/client';

import { PrintService } from './print.service';
import { EscPosRenderer } from './renderers/escpos.renderer';

const now = new Date('2026-07-10T00:00:00.000Z');
const printer = {
  id: 'printer-a', storeId: 'store-a', name: 'Front', code: 'FRONT', type: PrinterType.RECEIPT,
  connectionType: PrinterConnectionType.LAN, status: PrinterStatus.ACTIVE, host: '127.0.0.1', port: 19100,
  usbVendorId: null, usbProductId: null, paperWidth: 80, autoCut: true, cashDrawerPulse: false,
  createdAt: now, updatedAt: now,
};

const job = {
  id: 'job-a', storeId: 'store-a', printerId: printer.id, printer, sourceJob: null, requestedBy: null,
  documentType: PrintDocumentType.CUSTOMER_RECEIPT, referenceType: PrintJobReferenceType.ORDER, referenceId: 'order-a',
  status: PrintJobStatus.FAILED, reason: PrintJobReason.MANUAL, payload: { order: { orderNumber: 'A-1' }, items: [] },
  renderedText: null, byteLength: null, retryCount: 1, maxRetries: 3, lastError: 'offline', autoPrintKey: null,
  sourceJobId: null, requestedByUserId: null, claimedByDeviceId: null, startedAt: null, completedAt: now,
  nextRetryAt: null, createdAt: now, updatedAt: now,
};

function serviceWith(prisma: any, adapter: any = { send: async () => undefined }) {
  const service = new PrintService(
    prisma,
    {} as never,
    {} as never,
    new EscPosRenderer(),
    adapter,
    { getStoreId: () => 'store-a' } as never,
  );
  (service as any).enqueueProcessing = () => undefined;
  return service;
}

test('manual retry keeps retry count and returns job to pending', async () => {
  let updateData: any;
  const prisma = {
    printJob: {
      findFirst: async () => job,
      update: async ({ data }: any) => {
        updateData = data;
        return { ...job, status: PrintJobStatus.PENDING, nextRetryAt: null };
      },
    },
  };
  const result = await serviceWith(prisma).retryJob(job.id);
  assert.equal(result.status, PrintJobStatus.PENDING);
  assert.equal(updateData.retryCount, undefined);
});

test('manual retry is denied after max retries', async () => {
  const prisma = { printJob: { findFirst: async () => ({ ...job, retryCount: 3, maxRetries: 3 }) } };
  await assert.rejects(() => serviceWith(prisma).retryJob(job.id), BadRequestException);
});

test('reprint creates a new job with immutable payload snapshot and source id', async () => {
  let createData: any;
  const prisma = {
    printJob: {
      findFirst: async () => ({ ...job, status: PrintJobStatus.SUCCEEDED }),
      create: async ({ data }: any) => {
        createData = data;
        return { ...job, ...data, id: 'job-reprint', status: PrintJobStatus.PENDING, sourceJob: { id: job.id }, requestedBy: null };
      },
    },
  };
  const result = await serviceWith(prisma).reprintJob(job.id, { id: 'owner', email: 'owner@test', name: 'Owner', storeId: 'store-a', role: 'OWNER' });
  assert.equal(result.sourceJobId, job.id);
  assert.equal(createData.reason, PrintJobReason.MANUAL_REPRINT);
  assert.deepEqual(createData.payload, job.payload);
});

test('order reprint resolves the latest receipt job instead of regenerating its payload', async () => {
  let createData: any;
  const prisma = {
    printJob: {
      findFirst: async () => ({ ...job, status: PrintJobStatus.SUCCEEDED }),
      create: async ({ data }: any) => {
        createData = data;
        return { ...job, ...data, id: 'job-order-reprint', status: PrintJobStatus.PENDING, sourceJob: { id: job.id }, requestedBy: null };
      },
    },
  };
  const result = await serviceWith(prisma).reprintOrderReceipt(job.referenceId, {
    id: 'cashier', email: 'cashier@test', name: 'Cashier', storeId: 'store-a', role: 'CASHIER',
  });
  assert.equal(result.sourceJobId, job.id);
  assert.equal(createData.reason, PrintJobReason.MANUAL_REPRINT);
  assert.deepEqual(createData.payload, job.payload);
});

test('LAN failure marks the job and order print status failed without touching order payment state', async () => {
  const orderUpdates: any[] = [];
  const prisma = {
    printJob: {
      findFirst: async () => ({ ...job, status: PrintJobStatus.PENDING }),
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: any) => ({ ...job, ...data, status: PrintJobStatus.FAILED, retryCount: 2 }),
    },
    order: { updateMany: async (input: any) => { orderUpdates.push(input); return { count: 1 }; } },
  };
  const result = await (serviceWith(prisma, { send: async () => { throw new Error('connection refused'); } }) as any).processJob(job.id);
  assert.equal(result.status, PrintJobStatus.FAILED);
  assert.equal(result.retryCount, 2);
  assert.equal(orderUpdates.at(-1).data.printStatus, 'FAILED');
  assert.equal(orderUpdates.at(-1).data.status, undefined);
});
