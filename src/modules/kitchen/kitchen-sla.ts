import type { KitchenTicketStatus } from '@prisma/client';

export type KitchenSlaStatus = 'NORMAL' | 'WARNING' | 'OVERDUE';

export type KitchenSlaTicket = {
  status: KitchenTicketStatus;
  createdAt: Date;
  startedAt: Date | null;
  readyAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  station: {
    warningMinutes: number;
    overdueMinutes: number;
  };
};

export function calculateKitchenSla(ticket: KitchenSlaTicket, now = new Date()) {
  const completedAt = ticket.completedAt ?? ticket.readyAt ?? ticket.cancelledAt;
  const waitEnd = ticket.startedAt ?? completedAt ?? now;
  const cookStart = ticket.startedAt;
  const cookEnd = completedAt ?? now;
  const waitMinutes = diffMinutes(ticket.createdAt, waitEnd);
  const cookMinutes = cookStart ? diffMinutes(cookStart, cookEnd) : null;
  const elapsed = cookMinutes ?? waitMinutes;

  return {
    waitMinutes,
    cookMinutes,
    slaStatus: getSlaStatus(elapsed, ticket.station.warningMinutes, ticket.station.overdueMinutes),
  };
}

export function getSlaStatus(elapsedMinutes: number, warningMinutes: number, overdueMinutes: number): KitchenSlaStatus {
  if (elapsedMinutes >= overdueMinutes) return 'OVERDUE';
  if (elapsedMinutes >= warningMinutes) return 'WARNING';
  return 'NORMAL';
}

function diffMinutes(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60000));
}
