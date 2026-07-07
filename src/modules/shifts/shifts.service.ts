import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CashMovementReferenceType, CashMovementType, PaymentMethod, Prisma, ShiftStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { StoreContextService } from '@/common/store-context.service';
import { toMoney, toMoneyNumber } from '@/common/utils/money';
import type { AuthRequestUser } from '@/modules/auth/auth.types';
import { PrismaService } from '@/prisma/prisma.service';

import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/shift.dto';

type Tx = Prisma.TransactionClient;

type ShiftWithMovements = Prisma.ShiftGetPayload<{
  include: {
    user: true;
    openedBy: true;
    closedBy: true;
    movements: { include: { createdBy: true }; orderBy: { createdAt: 'asc' } };
  };
}>;

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext?: StoreContextService,
  ) {}

  async getActiveShift(currentUser: AuthRequestUser) {
    const shift = await this.findActiveShift(currentUser.id);
    return shift ? this.presentShift(shift) : null;
  }

  async openShift(dto: OpenShiftDto, currentUser: AuthRequestUser) {
    const existing = await this.findActiveShift(currentUser.id);
    if (existing) {
      return this.presentShift(existing);
    }

    const storeId = this.getStoreId();
    const openingCash = toMoney(dto.openingCash);
    const shift = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.shift.create({
          data: {
            storeId,
            userId: currentUser.id,
            status: ShiftStatus.OPEN,
            openingCash,
            expectedCash: openingCash,
            openedByUserId: currentUser.id,
            notes: dto.notes,
          },
        });

        await tx.cashMovement.create({
          data: {
            storeId,
            shiftId: created.id,
            type: CashMovementType.OPENING,
            amount: openingCash,
            reason: dto.notes?.trim() || 'Opening cash',
            referenceType: CashMovementReferenceType.MANUAL,
            createdByUserId: currentUser.id,
          },
        });

        return tx.shift.findUniqueOrThrow({ where: { id: created.id }, include: this.shiftInclude() });
      },
      { maxWait: 15_000, timeout: 20_000 },
    );

    return this.presentShift(shift);
  }

  async listShifts() {
    const shifts = await this.prisma.shift.findMany({
      where: { storeId: this.getStoreId() },
      include: this.shiftInclude(),
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return shifts.map((shift) => this.presentShift(shift));
  }

  async getShift(id: string) {
    const shift = await this.findShift(id);
    return this.presentShift(shift);
  }

  async cashIn(id: string, dto: CashMovementDto, currentUser: AuthRequestUser) {
    return this.createManualMovement(id, CashMovementType.CASH_IN, dto, currentUser);
  }

  async cashOut(id: string, dto: CashMovementDto, currentUser: AuthRequestUser) {
    const shift = await this.findShift(id);
    this.assertOpen(shift);
    const amount = toMoney(dto.amount);
    const summary = this.calculateSummary(shift.movements);
    if (amount.greaterThan(summary.expectedCash)) {
      throw new BadRequestException('Cash out cannot exceed expected cash.');
    }
    return this.createManualMovement(id, CashMovementType.CASH_OUT, dto, currentUser);
  }

  async adjustment(id: string, dto: CashMovementDto, currentUser: AuthRequestUser) {
    return this.createManualMovement(id, CashMovementType.ADJUSTMENT, dto, currentUser);
  }

  async closeShift(id: string, dto: CloseShiftDto, currentUser: AuthRequestUser) {
    const shift = await this.findShift(id);
    this.assertOpen(shift);
    const summary = this.calculateSummary(shift.movements);
    const actualCash = toMoney(dto.actualCash);
    const variance = actualCash.minus(summary.expectedCash).toDecimalPlaces(2);
    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CLOSED,
        closedAt: new Date(),
        actualCash,
        variance,
        expectedCash: summary.expectedCash,
        closedByUserId: currentUser.id,
        notes: dto.notes ?? shift.notes,
      },
      include: this.shiftInclude(),
    });
    return this.presentShift(updated);
  }

  async getMovements(id: string) {
    const shift = await this.findShift(id);
    return shift.movements.map((movement) => this.presentMovement(movement));
  }

  async requireActiveShift(userId: string) {
    const shift = await this.findActiveShift(userId);
    if (!shift) {
      throw new BadRequestException('Open shift required before checkout.');
    }
    return shift;
  }

  async recordCashSaleMovements(tx: Tx, input: {
    storeId: string;
    shiftId: string;
    orderId: string;
    payments: Array<{ id: string; method: PaymentMethod; amount: Decimal }>;
    createdByUserId?: string;
  }) {
    const cashPayments = input.payments.filter((payment) => payment.method === PaymentMethod.CASH);
    for (const payment of cashPayments) {
      await tx.cashMovement.upsert({
        where: {
          storeId_type_referenceType_referenceId: {
            storeId: input.storeId,
            type: CashMovementType.SALE,
            referenceType: CashMovementReferenceType.ORDER_PAYMENT,
            referenceId: payment.id,
          },
        },
        update: {},
        create: {
          storeId: input.storeId,
          shiftId: input.shiftId,
          type: CashMovementType.SALE,
          amount: payment.amount,
          reason: `Cash sale for order ${input.orderId}`,
          referenceType: CashMovementReferenceType.ORDER_PAYMENT,
          referenceId: payment.id,
          createdByUserId: input.createdByUserId,
        },
      });
    }
  }

  async recordCashRefundMovement(tx: Tx, input: {
    storeId: string;
    shiftId: string;
    refundId: string;
    amount: Decimal;
    reason: string;
    createdByUserId?: string;
  }) {
    await tx.cashMovement.upsert({
      where: {
        storeId_type_referenceType_referenceId: {
          storeId: input.storeId,
          type: CashMovementType.REFUND,
          referenceType: CashMovementReferenceType.REFUND,
          referenceId: input.refundId,
        },
      },
      update: {},
      create: {
        storeId: input.storeId,
        shiftId: input.shiftId,
        type: CashMovementType.REFUND,
        amount: input.amount,
        reason: input.reason,
        referenceType: CashMovementReferenceType.REFUND,
        referenceId: input.refundId,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  private async createManualMovement(id: string, type: CashMovementType, dto: CashMovementDto, currentUser: AuthRequestUser) {
    const shift = await this.findShift(id);
    this.assertOpen(shift);
    await this.prisma.cashMovement.create({
      data: {
        storeId: this.getStoreId(),
        shiftId: id,
        type,
        amount: toMoney(dto.amount),
        reason: dto.reason,
        referenceType: CashMovementReferenceType.MANUAL,
        createdByUserId: currentUser.id,
      },
    });
    const updated = await this.findShift(id);
    return this.presentShift(updated);
  }

  private async findActiveShift(userId: string) {
    return this.prisma.shift.findFirst({
      where: { storeId: this.getStoreId(), userId, status: ShiftStatus.OPEN },
      include: this.shiftInclude(),
      orderBy: { openedAt: 'desc' },
    });
  }

  private async findShift(id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, storeId: this.getStoreId() },
      include: this.shiftInclude(),
    });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }
    return shift;
  }

  private assertOpen(shift: ShiftWithMovements) {
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('Shift is closed.');
    }
  }

  private calculateSummary(movements: ShiftWithMovements['movements']) {
    const summary = {
      openingCash: new Decimal(0),
      cashSales: new Decimal(0),
      cashRefunds: new Decimal(0),
      cashIn: new Decimal(0),
      cashOut: new Decimal(0),
      adjustments: new Decimal(0),
    };

    for (const movement of movements) {
      switch (movement.type) {
        case CashMovementType.OPENING:
          summary.openingCash = summary.openingCash.plus(movement.amount);
          break;
        case CashMovementType.SALE:
          summary.cashSales = summary.cashSales.plus(movement.amount);
          break;
        case CashMovementType.REFUND:
          summary.cashRefunds = summary.cashRefunds.plus(movement.amount);
          break;
        case CashMovementType.CASH_IN:
          summary.cashIn = summary.cashIn.plus(movement.amount);
          break;
        case CashMovementType.CASH_OUT:
          summary.cashOut = summary.cashOut.plus(movement.amount);
          break;
        case CashMovementType.ADJUSTMENT:
          summary.adjustments = summary.adjustments.plus(movement.amount);
          break;
      }
    }

    const expectedCash = summary.openingCash
      .plus(summary.cashSales)
      .minus(summary.cashRefunds)
      .plus(summary.cashIn)
      .minus(summary.cashOut)
      .plus(summary.adjustments)
      .toDecimalPlaces(2);
    return { ...summary, expectedCash };
  }

  private presentShift(shift: ShiftWithMovements) {
    const summary = shift.status === ShiftStatus.CLOSED ? this.calculateSummary(shift.movements) : this.calculateSummary(shift.movements);
    const expectedCash = shift.status === ShiftStatus.CLOSED ? shift.expectedCash : summary.expectedCash;
    return {
      id: shift.id,
      storeId: shift.storeId,
      userId: shift.userId,
      staffName: shift.user.name ?? shift.user.email,
      status: shift.status,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      openingCash: toMoneyNumber(shift.openingCash),
      cashSales: toMoneyNumber(summary.cashSales),
      cashRefunds: toMoneyNumber(summary.cashRefunds),
      cashIn: toMoneyNumber(summary.cashIn),
      cashOut: toMoneyNumber(summary.cashOut),
      adjustments: toMoneyNumber(summary.adjustments),
      expectedCash: toMoneyNumber(expectedCash),
      actualCash: shift.actualCash === null ? null : toMoneyNumber(shift.actualCash),
      variance: shift.variance === null ? null : toMoneyNumber(shift.variance),
      openedByUserId: shift.openedByUserId,
      closedByUserId: shift.closedByUserId,
      notes: shift.notes,
      movements: shift.movements.map((movement) => this.presentMovement(movement)),
      createdAt: shift.createdAt.toISOString(),
      updatedAt: shift.updatedAt.toISOString(),
    };
  }

  private presentMovement(movement: ShiftWithMovements['movements'][number]) {
    return {
      id: movement.id,
      shiftId: movement.shiftId,
      type: movement.type,
      amount: toMoneyNumber(movement.amount),
      reason: movement.reason,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      createdByUserId: movement.createdByUserId,
      createdByName: movement.createdBy?.name ?? movement.createdBy?.email ?? null,
      createdAt: movement.createdAt.toISOString(),
    };
  }

  private shiftInclude() {
    return {
      user: true,
      openedBy: true,
      closedBy: true,
      movements: {
        include: { createdBy: true },
        orderBy: { createdAt: 'asc' },
      },
    } satisfies Prisma.ShiftInclude;
  }

  private getStoreId() {
    return this.storeContext?.getStoreId() ?? 'test-store';
  }
}
