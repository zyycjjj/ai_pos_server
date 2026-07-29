import type { KitchenPrintMode, Prisma } from '@prisma/client';

type PreviewTicket = Prisma.KitchenTicketGetPayload<{
  include: { station: true; order: { include: { table: true } }; items: true; store: true };
}>;

export function buildKitchenTicketPreview(ticket: PreviewTicket, mode: KitchenPrintMode) {
  const lines = [
    `${ticket.store.name}`,
    `Kitchen Ticket ${ticket.ticketNumber}`,
    `Station: ${ticket.station.name}`,
    `Order: ${ticket.order.orderNumber}`,
    ticket.order.table ? `Table: ${ticket.order.table.name}` : `Pickup: ${ticket.order.pickupNumber ?? '-'}`,
    '',
    ...ticket.items.flatMap((item) => [
      `${item.quantity} x ${item.productNameSnapshot}`,
      ...formatModifiers(item.modifiers).map((modifier) => `  - ${modifier}`),
      ...(item.notes ? [`  Note: ${item.notes}`] : []),
    ]),
  ];

  return {
    ticketId: ticket.id,
    mode,
    stationName: ticket.station.name,
    tableName: ticket.order.table?.name ?? null,
    orderNo: ticket.order.orderNumber,
    items: ticket.items.map((item) => ({
      id: item.id,
      name: item.productNameSnapshot,
      quantity: item.quantity,
      modifiers: formatModifiers(item.modifiers),
      note: item.notes,
    })),
    textPreview: lines.join('\n'),
  };
}

function formatModifiers(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const optionName = 'optionName' in item ? item.optionName : undefined;
      const quantity = 'quantity' in item ? item.quantity : undefined;
      if (typeof optionName !== 'string') return null;
      return typeof quantity === 'number' && quantity > 1 ? `${optionName} x${quantity}` : optionName;
    })
    .filter((item): item is string => Boolean(item));
}
