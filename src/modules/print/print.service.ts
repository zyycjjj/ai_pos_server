import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PrinterConnectionType,
  PrinterRouteType,
  PrinterStatus,
  PrintStatus,
  PrintDocumentType,
  PrintJobReason,
  PrintJobReferenceType,
  PrintJobStatus,
  Prisma,
} from '@prisma/client';

import { StoreContextService } from '@/common/store-context.service';
import { toMoneyNumber } from '@/common/utils/money';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { ReceiptsService } from '@/modules/receipts/receipts.service';
import { ShiftsService } from '@/modules/shifts/shifts.service';
import { PrismaService } from '@/prisma/prisma.service';

import { LanPrinterAdapter } from './adapters/lan-printer.adapter';
import { ListPrintJobsDto, PrintFailDto, UpsertPrinterDto, UpsertPrinterRouteDto } from './dto/print.dto';
import { EscPosRenderer } from './renderers/escpos.renderer';

type JobWithPrinter = Prisma.PrintJobGetPayload<{ include: { printer: true; sourceJob: true; requestedBy: true } }>;

@Injectable()
export class PrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptsService: ReceiptsService,
    private readonly shiftsService: ShiftsService,
    private readonly renderer: EscPosRenderer,
    private readonly lanAdapter: LanPrinterAdapter,
    private readonly storeContext?: StoreContextService,
  ) {}

  async listPrinters() {
    const printers = await this.prisma.printer.findMany({
      where: { storeId: this.getStoreId() },
      orderBy: [{ status: 'asc' }, { type: 'asc' }, { name: 'asc' }],
    });
    return printers.map((printer) => this.presentPrinter(printer));
  }

  async createPrinter(dto: UpsertPrinterDto) {
    this.validatePrinter(dto);
    const printer = await this.prisma.printer.create({
      data: {
        storeId: this.getStoreId(),
        name: this.cleanName(dto.name, 'Printer name is required.'),
        code: this.cleanCode(dto.code),
        type: dto.type,
        connectionType: dto.connectionType,
        host: dto.host?.trim() || null,
        port: dto.port ?? null,
        usbVendorId: dto.usbVendorId?.trim() || null,
        usbProductId: dto.usbProductId?.trim() || null,
        paperWidth: dto.paperWidth ?? 80,
        autoCut: dto.autoCut ?? true,
        cashDrawerPulse: dto.cashDrawerPulse ?? false,
      },
    });
    return this.presentPrinter(printer);
  }

  async updatePrinter(id: string, dto: UpsertPrinterDto) {
    await this.findPrinter(id);
    this.validatePrinter(dto);
    const printer = await this.prisma.printer.update({
      where: { id },
      data: {
        name: this.cleanName(dto.name, 'Printer name is required.'),
        code: this.cleanCode(dto.code),
        type: dto.type,
        connectionType: dto.connectionType,
        host: dto.host?.trim() || null,
        port: dto.port ?? null,
        usbVendorId: dto.usbVendorId?.trim() || null,
        usbProductId: dto.usbProductId?.trim() || null,
        paperWidth: dto.paperWidth ?? 80,
        autoCut: dto.autoCut ?? true,
        cashDrawerPulse: dto.cashDrawerPulse ?? false,
      },
    });
    return this.presentPrinter(printer);
  }

  async updatePrinterStatus(id: string, status: PrinterStatus) {
    await this.findPrinter(id);
    const printer = await this.prisma.printer.update({ where: { id }, data: { status } });
    return this.presentPrinter(printer);
  }

  async testPrint(id: string, currentUser?: AuthRequestUser) {
    const printer = await this.findPrinter(id);
    const payload = {
      printer: this.presentPrinter(printer),
      createdAt: new Date().toISOString(),
    };
    return this.createJob({
      printerId: printer.id,
      documentType: PrintDocumentType.TEST_PAGE,
      referenceType: PrintJobReferenceType.TEST,
      referenceId: printer.id,
      payload,
      reason: PrintJobReason.TEST,
      requestedByUserId: currentUser?.id,
    });
  }

  async listRoutes() {
    const routes = await this.prisma.printerRoute.findMany({
      where: { storeId: this.getStoreId() },
      include: { printer: true },
      orderBy: [{ documentType: 'asc' }, { routeType: 'asc' }, { createdAt: 'asc' }],
    });
    return routes.map((route) => this.presentRoute(route));
  }

  async upsertRoute(dto: UpsertPrinterRouteDto) {
    const printer = await this.findPrinter(dto.printerId);
    if (printer.status !== PrinterStatus.ACTIVE) {
      throw new BadRequestException('Printer route requires an active printer.');
    }
    const targetId = dto.routeType === PrinterRouteType.STORE_DEFAULT ? 'STORE' : dto.targetId;
    if (dto.routeType === PrinterRouteType.KITCHEN_STATION && !targetId) {
      throw new BadRequestException('Kitchen station route requires targetId.');
    }
    const routeTargetId = targetId ?? 'STORE';
    if (dto.routeType === PrinterRouteType.KITCHEN_STATION) {
      const station = await this.prisma.kitchenStation.findFirst({ where: { id: routeTargetId, storeId: this.getStoreId() } });
      if (!station) {
        throw new BadRequestException('Kitchen station not found.');
      }
    }
    const route = await this.prisma.printerRoute.upsert({
      where: {
        storeId_routeType_targetId_documentType: {
          storeId: this.getStoreId(),
          routeType: dto.routeType,
          targetId: routeTargetId,
          documentType: dto.documentType,
        },
      },
      update: { printerId: printer.id },
      create: {
        storeId: this.getStoreId(),
        printerId: printer.id,
        routeType: dto.routeType,
        targetId: routeTargetId,
        documentType: dto.documentType,
      },
    });
    const withPrinter = await this.prisma.printerRoute.findUniqueOrThrow({ where: { id: route.id }, include: { printer: true } });
    return this.presentRoute(withPrinter);
  }

  async deleteRoute(id: string) {
    await this.findRoute(id);
    await this.prisma.printerRoute.delete({ where: { id } });
    return { id, deleted: true };
  }

  async listJobs(query: ListPrintJobsDto = {}) {
    const jobs = await this.prisma.printJob.findMany({
      where: {
        storeId: this.getStoreId(),
        ...(query.status ? { status: query.status } : {}),
        ...(query.printerId ? { printerId: query.printerId } : {}),
        ...(query.documentType ? { documentType: query.documentType } : {}),
      },
      include: this.jobInclude(),
      orderBy: { createdAt: 'desc' },
      take: query.take ?? 100,
    });
    return jobs.map((job) => this.presentJob(job));
  }

  async getJob(id: string) {
    const job = await this.findJob(id);
    return this.presentJob(job);
  }

  async retryJob(id: string) {
    const job = await this.findJob(id);
    if (job.status !== PrintJobStatus.FAILED) {
      throw new BadRequestException('Only failed print jobs can be retried.');
    }
    if (job.retryCount >= job.maxRetries) {
      throw new BadRequestException('Print job reached its retry limit.');
    }
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: PrintJobStatus.PENDING, nextRetryAt: null },
      include: this.jobInclude(),
    });
    this.enqueueProcessing(updated.id);
    return this.presentJob(updated);
  }

  async reprintJob(id: string, currentUser?: AuthRequestUser) {
    const job = await this.findJob(id);
    const created = await this.createJob({
      printerId: job.printerId,
      documentType: job.documentType,
      referenceType: job.referenceType,
      referenceId: job.referenceId,
      payload: job.payload,
      reason: PrintJobReason.MANUAL_REPRINT,
      sourceJobId: job.id,
      requestedByUserId: currentUser?.id,
    });
    return created;
  }

  async printOrderReceipt(orderId: string, currentUser?: AuthRequestUser) {
    const route = await this.resolveStoreRoute(PrintDocumentType.CUSTOMER_RECEIPT);
    const payload = await this.receiptsService.getReceiptForOrder(orderId);
    return this.createJob({
      printerId: route?.printerId,
      documentType: PrintDocumentType.CUSTOMER_RECEIPT,
      referenceType: PrintJobReferenceType.ORDER,
      referenceId: orderId,
      payload,
      reason: PrintJobReason.MANUAL,
      requestedByUserId: currentUser?.id,
    });
  }

  async reprintOrderReceipt(orderId: string, currentUser?: AuthRequestUser) {
    const latestJob = await this.prisma.printJob.findFirst({
      where: {
        storeId: this.getStoreId(),
        documentType: PrintDocumentType.CUSTOMER_RECEIPT,
        referenceType: PrintJobReferenceType.ORDER,
        referenceId: orderId,
      },
      orderBy: { createdAt: 'desc' },
      include: this.jobInclude(),
    });
    if (!latestJob) {
      return this.printOrderReceipt(orderId, currentUser);
    }
    return this.reprintJob(latestJob.id, currentUser);
  }

  async printKitchenTicket(ticketId: string, currentUser?: AuthRequestUser) {
    const payload = await this.buildKitchenTicketPayload(ticketId);
    const route = await this.resolveKitchenRoute(payload.station.id);
    return this.createJob({
      printerId: route?.printerId,
      documentType: PrintDocumentType.KITCHEN_TICKET,
      referenceType: PrintJobReferenceType.KITCHEN_TICKET,
      referenceId: ticketId,
      payload,
      reason: PrintJobReason.MANUAL,
      requestedByUserId: currentUser?.id,
    });
  }

  async printRefundReceipt(refundId: string, currentUser?: AuthRequestUser) {
    const route = await this.resolveStoreRoute(PrintDocumentType.REFUND_RECEIPT);
    const payload = await this.receiptsService.getReceiptForRefund(refundId);
    return this.createJob({
      printerId: route?.printerId,
      documentType: PrintDocumentType.REFUND_RECEIPT,
      referenceType: PrintJobReferenceType.REFUND,
      referenceId: refundId,
      payload,
      reason: PrintJobReason.MANUAL,
      requestedByUserId: currentUser?.id,
    });
  }

  async printShiftSummary(shiftId: string, currentUser?: AuthRequestUser) {
    const route = await this.resolveStoreRoute(PrintDocumentType.SHIFT_SUMMARY);
    const payload = await this.buildShiftSummaryPayload(shiftId);
    return this.createJob({
      printerId: route?.printerId,
      documentType: PrintDocumentType.SHIFT_SUMMARY,
      referenceType: PrintJobReferenceType.SHIFT,
      referenceId: shiftId,
      payload,
      reason: PrintJobReason.MANUAL,
      requestedByUserId: currentUser?.id,
    });
  }

  async createAutoJobsForOrder(orderId: string) {
    const receiptRoute = await this.resolveStoreRoute(PrintDocumentType.CUSTOMER_RECEIPT);
    if (receiptRoute) {
      await this.createJob({
        printerId: receiptRoute.printerId,
        documentType: PrintDocumentType.CUSTOMER_RECEIPT,
        referenceType: PrintJobReferenceType.ORDER,
        referenceId: orderId,
        payload: await this.receiptsService.getReceiptForOrder(orderId),
        reason: PrintJobReason.AUTO,
        autoPrintKey: 'auto-receipt',
      }).catch(() => undefined);
    }

    const tickets = await this.prisma.kitchenTicket.findMany({ where: { storeId: this.getStoreId(), orderId }, select: { id: true } });
    for (const ticket of tickets) {
      await this.createAutoKitchenTicketJob(ticket.id).catch(() => undefined);
    }
  }

  async createAutoKitchenTicketJob(ticketId: string) {
    const payload = await this.buildKitchenTicketPayload(ticketId);
    const route = await this.resolveKitchenRoute(payload.station.id);
    if (!route) {
      return null;
    }
    return this.createJob({
      printerId: route.printerId,
      documentType: PrintDocumentType.KITCHEN_TICKET,
      referenceType: PrintJobReferenceType.KITCHEN_TICKET,
      referenceId: ticketId,
      payload,
      reason: PrintJobReason.AUTO,
      autoPrintKey: 'auto-kitchen-ticket',
    });
  }

  async listDeviceJobs(deviceId: string) {
    const jobs = await this.prisma.printJob.findMany({
      where: {
        storeId: this.getStoreId(),
        status: PrintJobStatus.PENDING,
        renderedText: { not: null },
        printer: { connectionType: PrinterConnectionType.USB, status: PrinterStatus.ACTIVE },
      },
      include: this.jobInclude(),
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return jobs.map((job) => ({ ...this.presentJob(job), deviceId }));
  }

  async claimDeviceJob(id: string, deviceId: string) {
    const job = await this.findJob(id);
    if (job.status !== PrintJobStatus.PENDING) {
      throw new BadRequestException('Print job is not pending.');
    }
    if (job.printer?.connectionType !== PrinterConnectionType.USB) {
      throw new BadRequestException('Only USB print jobs can be claimed by device runtime.');
    }
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: PrintJobStatus.PROCESSING, claimedByDeviceId: deviceId, startedAt: new Date() },
      include: this.jobInclude(),
    });
    await this.syncOrderPrintStatus(updated, PrintStatus.PRINTING);
    return this.presentJob(updated);
  }

  async completeDeviceJob(id: string, deviceId: string) {
    await this.assertDeviceClaim(id, deviceId);
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: PrintJobStatus.SUCCEEDED, completedAt: new Date(), lastError: null },
      include: this.jobInclude(),
    });
    await this.syncOrderPrintStatus(updated, PrintStatus.PRINTED);
    return this.presentJob(updated);
  }

  async failDeviceJob(id: string, deviceId: string, dto: PrintFailDto) {
    await this.assertDeviceClaim(id, deviceId);
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: PrintJobStatus.FAILED, completedAt: new Date(), lastError: dto.error, retryCount: { increment: 1 } },
      include: this.jobInclude(),
    });
    await this.syncOrderPrintStatus(updated, PrintStatus.FAILED);
    return this.presentJob(updated);
  }

  async processPendingJobs(limit = 20) {
    const jobs = await this.prisma.printJob.findMany({
      where: {
        storeId: this.getStoreId(),
        status: PrintJobStatus.PENDING,
        printer: { connectionType: PrinterConnectionType.LAN, status: PrinterStatus.ACTIVE },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: this.jobInclude(),
    });
    for (const job of jobs) {
      await this.processJob(job.id);
    }
    return { processed: jobs.length };
  }

  private async createJob(input: {
    printerId?: string | null;
    documentType: PrintDocumentType;
    referenceType: PrintJobReferenceType;
    referenceId: string;
    payload: unknown;
    reason: PrintJobReason;
    autoPrintKey?: string;
    sourceJobId?: string;
    requestedByUserId?: string;
  }) {
    const data = {
      storeId: this.getStoreId(),
      printerId: input.printerId ?? null,
      documentType: input.documentType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      payload: input.payload as Prisma.InputJsonValue,
      reason: input.reason,
      autoPrintKey: input.autoPrintKey,
      sourceJobId: input.sourceJobId,
      requestedByUserId: input.requestedByUserId,
    };

    const job =
      input.autoPrintKey !== undefined
        ? await this.prisma.printJob.upsert({
            where: {
              storeId_documentType_referenceType_referenceId_autoPrintKey: {
                storeId: data.storeId,
                documentType: data.documentType,
                referenceType: data.referenceType,
                referenceId: data.referenceId,
                autoPrintKey: input.autoPrintKey,
              },
            },
            update: {},
            create: data,
            include: this.jobInclude(),
          })
        : await this.prisma.printJob.create({ data, include: this.jobInclude() });

    this.enqueueProcessing(job.id);
    return this.presentJob(job);
  }

  private enqueueProcessing(jobId: string) {
    setTimeout(() => {
      void this.processJob(jobId);
    }, 0);
  }

  private async processJob(id: string) {
    const job = await this.findJob(id);
    if (job.status !== PrintJobStatus.PENDING) {
      return this.presentJob(job);
    }
    if (!job.printer) {
      return this.failJob(job.id, 'No printer resolved for print job.');
    }
    let rendered: ReturnType<EscPosRenderer['render']>;
    try {
      rendered = this.renderer.render(job.documentType, job.payload);
    } catch (error) {
      return this.failJob(job.id, `Render failed: ${sanitizeError(error)}`);
    }
    if (job.printer.connectionType === PrinterConnectionType.USB) {
      await this.prisma.printJob.update({
        where: { id: job.id },
        data: { renderedText: rendered.text, byteLength: rendered.bytes.length },
      });
      return this.presentJob(await this.findJob(job.id));
    }

    if (!job.printer.host || !job.printer.port) {
      return this.failJob(job.id, 'Invalid LAN printer config.');
    }

    const claimed = await this.prisma.printJob.updateMany({
      where: { id: job.id, status: PrintJobStatus.PENDING },
      data: { status: PrintJobStatus.PROCESSING, startedAt: new Date(), renderedText: rendered.text, byteLength: rendered.bytes.length },
    });
    if (claimed.count === 0) {
      return this.presentJob(await this.findJob(job.id));
    }
    await this.syncOrderPrintStatus(job, PrintStatus.PRINTING);
    try {
      await this.lanAdapter.send({ host: job.printer.host, port: job.printer.port, bytes: rendered.bytes });
      const updated = await this.prisma.printJob.update({
        where: { id: job.id },
        data: { status: PrintJobStatus.SUCCEEDED, completedAt: new Date(), lastError: null },
        include: this.jobInclude(),
      });
      await this.syncOrderPrintStatus(updated, PrintStatus.PRINTED);
      return this.presentJob(updated);
    } catch (error) {
      return this.failJob(job.id, sanitizeError(error));
    }
  }

  private async failJob(id: string, error: string) {
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: PrintJobStatus.FAILED, completedAt: new Date(), retryCount: { increment: 1 }, lastError: error },
      include: this.jobInclude(),
    });
    await this.syncOrderPrintStatus(updated, PrintStatus.FAILED);
    return this.presentJob(updated);
  }

  private async syncOrderPrintStatus(
    job: { storeId: string; documentType: PrintDocumentType; referenceType: PrintJobReferenceType; referenceId: string },
    status: PrintStatus,
  ) {
    if (job.documentType !== PrintDocumentType.CUSTOMER_RECEIPT || job.referenceType !== PrintJobReferenceType.ORDER) {
      return;
    }
    await this.prisma.order.updateMany({
      where: { id: job.referenceId, storeId: job.storeId },
      data: {
        printStatus: status,
        ...(status === PrintStatus.PRINTED ? { printedAt: new Date() } : {}),
      },
    });
  }

  private async buildKitchenTicketPayload(ticketId: string) {
    const ticket = await this.prisma.kitchenTicket.findFirst({
      where: { id: ticketId, storeId: this.getStoreId() },
      include: { store: true, station: true, order: true, items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) {
      throw new NotFoundException('Kitchen ticket not found.');
    }
    return {
      format: 'escpos-80mm',
      type: 'kitchen-ticket',
      store: { name: ticket.store?.name ?? 'AI-POS Store' },
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
      },
      station: {
        id: ticket.station.id,
        name: ticket.station.name,
        code: ticket.station.code,
      },
      order: {
        id: ticket.order.id,
        orderNumber: ticket.order.orderNumber,
        pickupNumber: ticket.order.pickupNumber,
        createdAt: ticket.order.createdAt.toISOString(),
      },
      items: ticket.items.map((item) => ({
        id: item.id,
        productName: item.productNameSnapshot,
        quantity: item.quantity,
        modifiers: item.modifiers ?? [],
        notes: item.notes,
      })),
    };
  }

  private async buildShiftSummaryPayload(shiftId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: this.getStoreId() } });
    const shift = await this.shiftsService.getShift(shiftId);
    return {
      format: 'escpos-80mm',
      type: 'shift-summary',
      store: { name: store?.name ?? 'AI-POS Store' },
      shift,
    };
  }

  private async resolveStoreRoute(documentType: PrintDocumentType) {
    return this.prisma.printerRoute.findFirst({
      where: {
        storeId: this.getStoreId(),
        routeType: PrinterRouteType.STORE_DEFAULT,
        documentType,
        printer: { status: PrinterStatus.ACTIVE },
      },
    });
  }

  private async resolveKitchenRoute(stationId: string) {
    return this.prisma.printerRoute.findFirst({
      where: {
        storeId: this.getStoreId(),
        routeType: PrinterRouteType.KITCHEN_STATION,
        targetId: stationId,
        documentType: PrintDocumentType.KITCHEN_TICKET,
        printer: { status: PrinterStatus.ACTIVE },
      },
    });
  }

  private async assertDeviceClaim(id: string, deviceId: string) {
    const job = await this.findJob(id);
    if (job.claimedByDeviceId !== deviceId || job.status !== PrintJobStatus.PROCESSING) {
      throw new BadRequestException('Print job is not claimed by this device.');
    }
    return job;
  }

  private async findPrinter(id: string) {
    const printer = await this.prisma.printer.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!printer) {
      throw new NotFoundException('Printer not found.');
    }
    return printer;
  }

  private async findRoute(id: string) {
    const route = await this.prisma.printerRoute.findFirst({ where: { id, storeId: this.getStoreId() } });
    if (!route) {
      throw new NotFoundException('Printer route not found.');
    }
    return route;
  }

  private async findJob(id: string) {
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId: this.getStoreId() }, include: this.jobInclude() });
    if (!job) {
      throw new NotFoundException('Print job not found.');
    }
    return job;
  }

  private jobInclude() {
    return { printer: true, sourceJob: true, requestedBy: true } satisfies Prisma.PrintJobInclude;
  }

  private validatePrinter(dto: UpsertPrinterDto) {
    if (dto.connectionType === PrinterConnectionType.LAN && (!dto.host?.trim() || !dto.port)) {
      throw new BadRequestException('LAN printer requires host and port.');
    }
    if (dto.connectionType === PrinterConnectionType.USB && (!dto.usbVendorId?.trim() || !dto.usbProductId?.trim())) {
      throw new BadRequestException('USB printer requires vendor and product id.');
    }
  }

  private presentPrinter(printer: {
    id: string;
    name: string;
    code: string;
    type: string;
    connectionType: string;
    status: string;
    host: string | null;
    port: number | null;
    usbVendorId: string | null;
    usbProductId: string | null;
    paperWidth: number;
    autoCut: boolean;
    cashDrawerPulse: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: printer.id,
      name: printer.name,
      code: printer.code,
      type: printer.type,
      connectionType: printer.connectionType,
      status: printer.status,
      host: printer.host,
      port: printer.port,
      usbVendorId: printer.usbVendorId,
      usbProductId: printer.usbProductId,
      paperWidth: printer.paperWidth,
      autoCut: printer.autoCut,
      cashDrawerPulse: printer.cashDrawerPulse,
      address: printer.connectionType === PrinterConnectionType.LAN ? `${printer.host}:${printer.port}` : `USB ${printer.usbVendorId}:${printer.usbProductId}`,
      createdAt: printer.createdAt.toISOString(),
      updatedAt: printer.updatedAt.toISOString(),
    };
  }

  private presentRoute(route: Prisma.PrinterRouteGetPayload<{ include: { printer: true } }>) {
    return {
      id: route.id,
      printerId: route.printerId,
      printer: this.presentPrinter(route.printer),
      routeType: route.routeType,
      targetId: route.targetId,
      documentType: route.documentType,
      createdAt: route.createdAt.toISOString(),
      updatedAt: route.updatedAt.toISOString(),
    };
  }

  private presentJob(job: JobWithPrinter) {
    return {
      id: job.id,
      printerId: job.printerId,
      printer: job.printer ? this.presentPrinter(job.printer) : null,
      documentType: job.documentType,
      referenceType: job.referenceType,
      referenceId: job.referenceId,
      status: job.status,
      reason: job.reason,
      payload: job.payload,
      renderedText: job.renderedText,
      byteLength: job.byteLength,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      lastError: job.lastError,
      autoPrintKey: job.autoPrintKey,
      sourceJobId: job.sourceJobId,
      requestedByUserId: job.requestedByUserId,
      requestedByName: job.requestedBy?.name ?? job.requestedBy?.email ?? null,
      claimedByDeviceId: job.claimedByDeviceId,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private cleanName(value: string, message: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(message);
    }
    return trimmed;
  }

  private cleanCode(value: string) {
    const trimmed = value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!trimmed) {
      throw new BadRequestException('Printer code is required.');
    }
    return trimmed;
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return String(error).slice(0, 1000);
}
