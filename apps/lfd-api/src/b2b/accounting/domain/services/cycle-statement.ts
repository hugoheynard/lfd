import type { CycleOrder, FrozenVatShare } from "../ports/cycle-orders.reader.js";

/**
 * **L'agrégation d'un relevé de cycle** — pure, sans horloge ni base.
 *
 * ## 🔴 Sommer des parts, jamais recalculer une TVA
 *
 * Le total d'un taux est la somme des parts **déjà arrondies** par
 * `ventilateVat` à la passation de chaque commande. On n'applique jamais un taux
 * à une base agrégée : on retomberait à un ou deux centimes près, et le relevé
 * ne rapprocherait plus le prélèvement (plan `agregation-des-commandes`, §1.1).
 *
 * ## La TVA non ventilée
 *
 * Une commande sans ventilation lisible a sa TVA totale (`vat_cents`) portée
 * dans une ligne à part. Il en résulte un invariant tenu par construction et
 * éprouvé par les tests : Σ TVA par taux + non ventilée = Σ `vat_cents`.
 *
 * ⚠️ Une ventilation **présente mais incohérente** — dont la somme ne vaut pas
 * `vat_cents` — est traitée comme absente. Aucune commande écrite par
 * `ventilateVat` n'est dans ce cas ; la règle existe pour que l'invariant
 * ci-dessus ne dépende pas de la santé de chaque JSON.
 */

/** Une commande du relevé, avec son HT et le sort de sa TVA. */
export interface StatementLine extends CycleOrder {
  /** `subtotal − discount − voucher` : la marchandise, hors livraison et surtaxe. */
  readonly htCents: number;
  /** Faux ⇒ la TVA de cette commande est comptée en « non ventilée ». */
  readonly vatVentilated: boolean;
}

export interface StatementTotals {
  readonly orderCount: number;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly htCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  /** Une part par taux réellement présent, du plus bas au plus haut. */
  readonly vatByRate: readonly FrozenVatShare[];
  readonly unventilatedVatCents: number;
  /** Σ `vat_cents` — égal à Σ `vatByRate` + `unventilatedVatCents`. */
  readonly vatCents: number;
  /** Σ `total_cents` — le TTC. */
  readonly totalCents: number;
}

export interface CycleStatement {
  readonly lines: readonly StatementLine[];
  readonly totals: StatementTotals;
}

/** Agrège les commandes d'un cycle, dans l'ordre où elles sont données. */
export function aggregateStatement(orders: readonly CycleOrder[]): CycleStatement {
  const lines = orders.map(toLine);
  return { lines, totals: totalsOf(lines) };
}

function toLine(order: CycleOrder): StatementLine {
  return {
    ...order,
    htCents: order.subtotalCents - order.discountCents - order.voucherDiscountCents,
    vatVentilated: isVentilated(order),
  };
}

/** Présente ET cohérente avec le total figé. */
function isVentilated(order: CycleOrder): boolean {
  if (order.vatShares === null) {
    return false;
  }
  return sum(order.vatShares.map((share) => share.amountCents)) === order.vatCents;
}

function totalsOf(lines: readonly StatementLine[]): StatementTotals {
  const total = (pick: (line: StatementLine) => number): number => sum(lines.map(pick));
  return {
    orderCount: lines.length,
    subtotalCents: total((line) => line.subtotalCents),
    discountCents: total((line) => line.discountCents),
    voucherDiscountCents: total((line) => line.voucherDiscountCents),
    htCents: total((line) => line.htCents),
    deliveryFeeCents: total((line) => line.deliveryFeeCents),
    lateFeeCents: total((line) => line.lateFeeCents),
    vatByRate: vatByRate(lines),
    unventilatedVatCents: total((line) => (line.vatVentilated ? 0 : line.vatCents)),
    vatCents: total((line) => line.vatCents),
    totalCents: total((line) => line.totalCents),
  };
}

/** La somme des parts figées, regroupées sur le `rate` numérique. */
function vatByRate(lines: readonly StatementLine[]): readonly FrozenVatShare[] {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    if (!line.vatVentilated || line.vatShares === null) {
      continue;
    }
    for (const share of line.vatShares) {
      byRate.set(share.rate, (byRate.get(share.rate) ?? 0) + share.amountCents);
    }
  }
  return [...byRate.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rate, amountCents]) => ({ rate, amountCents }));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Les taux présents dans un relevé — les colonnes de l'export. */
export function ratesOf(statement: CycleStatement): readonly number[] {
  return statement.totals.vatByRate.map((share) => share.rate);
}
