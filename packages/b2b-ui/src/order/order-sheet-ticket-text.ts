import type {
  ClientSheetLine,
  OrderRateAmounts,
  OrderTtcTerms,
  SheetMoney,
  StaffSheetLine,
} from '@lfd/contracts';

import { formatCents, formatVatPercent } from './order-format';

/**
 * **Le bon texte d'une commande composée en TTC, au format du ticket** (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 3 et lot C3) : les
 * lignes en TTC (quantité × étiquette), la remise, le bon et le port en TTC,
 * le total, puis le récapitulatif par taux — HT, TVA, TTC.
 *
 * Tout est LU sur la feuille : les TTC scellés des lignes, les TTC figés des
 * gestes (`money.ttcTerms`), la part figée de chaque taux (`money.ttcByRate`,
 * colonne `ttc_by_rate`). Aucune TVA n'est recalculée, aucune base
 * reconstituée. Une feuille qui n'a pas les trois garde son décompte HT.
 */

type PricedLine = ClientSheetLine | StaffSheetLine;

/** Une ligne au ticket : ses deux TTC scellés. */
interface TicketLine {
  readonly line: PricedLine;
  readonly unitTtcCents: number;
  readonly totalTtcCents: number;
}

function amount(text: string, width = 12): string {
  return text.padStart(width, ' ');
}

function ticketLinesOf(lines: readonly PricedLine[]): readonly TicketLine[] | null {
  const ticket: TicketLine[] = [];
  for (const line of lines) {
    if (line.unitPriceTtcCents === null || line.lineTotalTtcCents === null) {
      return null;
    }
    ticket.push({
      line,
      unitTtcCents: line.unitPriceTtcCents,
      totalTtcCents: line.lineTotalTtcCents,
    });
  }
  return ticket;
}

/**
 * Le décompte au format du ticket, ou `null` quand la feuille n'est pas celle
 * d'une commande composée en TTC — le bon garde alors son décompte HT.
 */
export function ticketSections(
  lines: readonly PricedLine[],
  money: SheetMoney,
): { readonly articles: readonly string[]; readonly money: readonly string[] } | null {
  const ttc = money.ttcTerms;
  const byRate = money.ttcByRate;
  const ticket = ticketLinesOf(lines);
  if (ttc === undefined || byRate === undefined || ticket === null) {
    return null;
  }
  return {
    articles: ticket.map(ticketArticle),
    money: [...gestureLines(ticket, ttc, money), ...rateLines(byRate)],
  };
}

function ticketArticle({ line, unitTtcCents, totalTtcCents }: TicketLine): string {
  const label = `${line.productName} (${line.sku})`;
  return `  ${String(line.quantity).padStart(3, ' ')} × ${label.padEnd(34, ' ')}${amount(
    formatCents(unitTtcCents),
  )}${amount(formatCents(totalTtcCents))}`;
}

function gestureLines(
  ticket: readonly TicketLine[],
  ttc: OrderTtcTerms,
  money: SheetMoney,
): readonly string[] {
  const goods = ticket.reduce((sum, line) => sum + line.totalTtcCents, 0);
  return [
    '',
    'DÉCOMPTE (TTC)',
    `  Articles      ${amount(formatCents(goods), 26)}`,
    ...(ttc.discountCents === 0
      ? []
      : [`  Remise        ${amount(`−${formatCents(ttc.discountCents)}`, 26)}`]),
    ...(ttc.voucherCents === 0
      ? []
      : [`  Bon fidélité  ${amount(`−${formatCents(ttc.voucherCents)}`, 26)}`]),
    ...(ttc.deliveryFeeCents === 0
      ? []
      : [`  Livraison     ${amount(formatCents(ttc.deliveryFeeCents), 26)}`]),
    `  Total TTC     ${amount(formatCents(money.totalCents), 26)}`,
  ];
}

/** Le récapitulatif par taux, recopié de la part figée. */
function rateLines(byRate: readonly OrderRateAmounts[]): readonly string[] {
  return [
    '',
    `  ${'Taux'.padEnd(8, ' ')}${amount('HT')}${amount('TVA')}${amount('TTC')}`,
    ...byRate.map(
      (part) =>
        `  ${formatVatPercent(part.rate).padEnd(8, ' ')}${amount(formatCents(part.htCents))}${amount(
          formatCents(part.vatCents),
        )}${amount(formatCents(part.ttcCents))}`,
    ),
  ];
}
