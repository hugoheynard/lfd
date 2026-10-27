import type { ClientSheetLine, OrderTtcTerms, SheetMoney, StaffSheetLine } from '@lfd/contracts';

import { formatCents, formatVatPercent } from './order-format';

/**
 * **Le bon texte d'une commande composée en TTC, au format du ticket** (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 3 et lot C3) : les
 * lignes en TTC (quantité × étiquette), la remise, le bon et le port en TTC,
 * le total, puis la TVA par taux. Tout est LU sur la feuille — les TTC scellés
 * des lignes, les TTC figés des gestes (`money.ttcTerms`), la TVA figée par
 * taux. Aucune TVA n'est recalculée ici.
 *
 * Le récapitulatif par taux dit HT, TVA et TTC quand la feuille permet de les
 * LIRE : sans geste (le TTC d'un taux est la somme de ses lignes), ou sur un
 * seul taux (il porte tout le total). Ailleurs, la commande ne fige pas la
 * part de chaque geste par taux : la TVA de chaque taux est dite, et le HT
 * global, plutôt qu'une base reconstituée.
 */

type PricedLine = ClientSheetLine | StaffSheetLine;

/** Une ligne au ticket : ses deux TTC scellés. */
interface TicketLine {
  readonly line: PricedLine;
  readonly unitTtcCents: number;
  readonly totalTtcCents: number;
}

/** Une ligne du récapitulatif par taux. */
export interface TicketRateRow {
  readonly rate: number;
  readonly htCents: number;
  readonly vatCents: number;
  readonly ttcCents: number;
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
  const ticket = ticketLinesOf(lines);
  if (ttc === undefined || ticket === null) {
    return null;
  }
  return {
    articles: ticket.map(ticketArticle),
    money: [...gestureLines(ticket, ttc, money), ...rateLines(ticket, ttc, money)],
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

/**
 * Le récapitulatif par taux, LU : `null` quand la feuille ne permet pas de
 * dire la base de chaque taux sans la reconstituer.
 */
export function readableRateRows(
  ticket: readonly {
    readonly line: { readonly vatRate: number };
    readonly totalTtcCents: number;
  }[],
  ttc: OrderTtcTerms,
  money: Pick<SheetMoney, 'vatShares' | 'vatCents' | 'totalCents'>,
): readonly TicketRateRow[] | null {
  const shares = money.vatShares;
  if (shares === null) {
    return null;
  }
  const vatOf = (rate: number): number =>
    shares.find((share) => share.rate === rate)?.amountCents ?? 0;
  const rates = [...new Set(ticket.map((entry) => entry.line.vatRate))].sort((a, b) => a - b);
  const noGesture = ttc.discountCents === 0 && ttc.voucherCents === 0 && ttc.deliveryFeeCents === 0;
  const single = rates.length === 1 && shares.every((share) => share.rate === rates[0]);
  if (!noGesture && !single) {
    return null;
  }
  const rows = rates.map((rate) => {
    const ttcCents = single
      ? money.totalCents
      : ticket
          .filter((entry) => entry.line.vatRate === rate)
          .reduce((sum, entry) => sum + entry.totalTtcCents, 0);
    const vatCents = single ? money.vatCents : vatOf(rate);
    return { rate, htCents: ttcCents - vatCents, vatCents, ttcCents };
  });
  const coversTotal = rows.reduce((sum, row) => sum + row.ttcCents, 0) === money.totalCents;
  return coversTotal ? rows : null;
}

function rateLines(
  ticket: readonly TicketLine[],
  ttc: OrderTtcTerms,
  money: SheetMoney,
): readonly string[] {
  const rows = readableRateRows(ticket, ttc, money);
  const head = ['', `  ${'Taux'.padEnd(8, ' ')}${amount('HT')}${amount('TVA')}${amount('TTC')}`];
  if (rows !== null) {
    return [
      ...head,
      ...rows.map(
        (row) =>
          `  ${formatVatPercent(row.rate).padEnd(8, ' ')}${amount(formatCents(row.htCents))}${amount(
            formatCents(row.vatCents),
          )}${amount(formatCents(row.ttcCents))}`,
      ),
    ];
  }
  // La part de chaque geste par taux n'est pas figée : la TVA de chaque taux,
  // puis le HT global — jamais une base reconstituée.
  return [
    '',
    ...(money.vatShares ?? []).map(
      (share) =>
        `  dont TVA ${formatVatPercent(share.rate).padEnd(6, ' ')}${amount(formatCents(share.amountCents), 18)}`,
    ),
    `  Total HT      ${amount(formatCents(money.totalCents - money.vatCents), 26)}`,
    `  Total TVA     ${amount(formatCents(money.vatCents), 26)}`,
  ];
}
