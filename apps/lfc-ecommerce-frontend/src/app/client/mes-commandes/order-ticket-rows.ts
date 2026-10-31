import { weightLabel } from '@lfd/money';

import { formatCents, formatRate } from '../format-money';
import type { DiscountLabelView } from '@lfd/contracts';

import type { OrderTicket } from './order-ticket';

/** Une ligne du ticket : un libellé, un montant mis en forme. */
export interface TicketRow {
  readonly label: string;
  readonly value: string;
}

/** Les mots du ticket — décrits par leur forme, pas par le dictionnaire. */
export interface TicketCopy {
  readonly ticketArticles: string;
  readonly ticketPerKilogram: string;
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
export function ticketRowsOf(
  ticket: OrderTicket,
  copy: TicketCopy,
  locale = 'fr',
): readonly TicketRow[] {
  const gestures: readonly (readonly [string, number])[] = [
    ...discountGestures(ticket, copy, locale),
    [copy.ticketVoucher, -ticket.voucherCents],
    [copy.ticketDelivery, ticket.deliveryFeeCents],
  ];
  return [
    ...ticket.lines.map((line) => ({
      // Au poids : « 500 g · Saumon (12,40 € / kg) » — l'étiquette est au kilo.
      label:
        line.saleUnit === 'weight'
          ? `${weightLabel(line.quantity)} · ${line.name} (${formatCents(line.unitTtcCents)} ${copy.ticketPerKilogram})`
          : `${String(line.quantity)} × ${line.name} (${formatCents(line.unitTtcCents)})`,
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

/**
 * Les remises du ticket : une par remise quand la commande en porte plusieurs
 * (plan des promotions, lot M6), nommée par son libellé figé dans la langue
 * de l'écran ; sinon LA ligne d'hier.
 */
function discountGestures(
  ticket: OrderTicket,
  copy: TicketCopy,
  locale: string,
): readonly (readonly [string, number])[] {
  if (ticket.discounts === undefined) {
    return [[copy.detailPickupDiscount, -ticket.discountCents]];
  }
  return ticket.discounts.map((discount) => [
    discount.label === undefined ? copy.detailPickupDiscount : labelIn(discount.label, locale),
    -discount.ttcCents,
  ]);
}

/**
 * La langue d'un libellé figé, repli français — la règle de `discountLabelIn`
 * (`@lfd/contracts`), recopiée : une valeur du baril n'entre pas dans la
 * boutique pour une ligne.
 */
function labelIn(label: DiscountLabelView, locale: string): string {
  return locale === 'en' ? label.en : locale === 'it' ? label.it : label.fr;
}
