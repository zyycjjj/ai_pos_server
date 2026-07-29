import { KitchenTicketStatus } from '@prisma/client';

export function assertTicketCanChangePriority(status: KitchenTicketStatus) {
  return status !== KitchenTicketStatus.READY && status !== KitchenTicketStatus.COMPLETED && status !== KitchenTicketStatus.CANCELLED;
}

export function sortPresentedKitchenTickets<T extends { urgent: boolean; slaStatus: string; createdAt: string }>(tickets: T[]) {
  const slaWeight: Record<string, number> = { OVERDUE: 2, WARNING: 1, NORMAL: 0 };
  return [...tickets].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const slaDiff = (slaWeight[b.slaStatus] ?? 0) - (slaWeight[a.slaStatus] ?? 0);
    if (slaDiff !== 0) return slaDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
