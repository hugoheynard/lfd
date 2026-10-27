import { formatCents, formatRate } from '../format-money';
import type { OrderTicket } from './order-ticket';

/** Une ligne du ticket : un libellé, un montant mis en forme. */
export interface TicketRow {
  readonly label: string;
  readonly value: string;
}

/** Les mots du ticket — décrits par leur forme, pas par le dictionnaire. */
export interface TicketCopy {
  readonly ticketArticles: string;
  readonly detailPickupDiscount: string;
  readonly ticketVoucher: string;
  readonly ticketDelivery: string;
  readonly ticketTotal: string;
  readonly ticketRate: string;
  readonly ticketPretax: string;
  readonly ticketVat: string;
  readonly ticketTaxed: string;
}

/**
 * Le ticket en lignes, dans l'ordre d'un ticket de caisse : chaque article,
 * les articles, les gestes qui ont eu lieu (signés), le total, puis un taux
 * par ligne — « HT · TVA · TTC ». Les gestes nuls sont tus.
 */
export function ticketRowsOf(ticket: OrderTicket, copy: TicketCopy): readonly TicketRow[] {
  const gestures: readonly (readonly [string, number])[] = [
    [copy.detailPickupDiscount, -ticket.discountCents],
    [copy.ticketVoucher, -ticket.voucherCents],
    [copy.ticketDelivery, ticket.deliveryFeeCents],
  ];
  return [
    ...ticket.lines.map((line) => ({
      label: `${String(line.quantity)} × ${line.name} (${formatCents(line.unitTtcCents)})`,
      value: formatCents(line.lineTtcCents),
    })),
    { label: copy.ticketArticles, value: formatCents(ticket.articlesCents) },
    ...gestures
      .filter(([, cents]) => cents !== 0)
      .map(([label, cents]) => ({ label, value: signed(cents) })),
    { label: copy.ticketTotal, value: formatCents(ticket.totalCents) },
    ...ticket.byRate.map((part) => ({
      label: `${copy.ticketRate} ${formatRate(part.rate)}`,
      value:
        `${copy.ticketPretax} ${formatCents(part.htCents)} · ` +
        `${copy.ticketVat} ${formatCents(part.vatCents)} · ` +
        `${copy.ticketTaxed} ${formatCents(part.ttcCents)}`,
    })),
  ];
}

function signed(cents: number): string {
  return cents < 0 ? `−${formatCents(-cents)}` : formatCents(cents);
}
