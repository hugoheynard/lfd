import { fractionByBasisPoints, fromCents, roundToCents } from "./exact.js";
import type { RatedCents } from "./order-vat-split.js";
import type { VatLine } from "./vat.js";

/**
 * **La ventilation de TVA d'une FACTURE** — au sens de la norme EN 16931, que
 * suivent Factur-X et CII.
 *
 * ## Pourquoi une seconde fonction, et pas `ventilateVat`
 *
 * `ventilateVat` calcule la TVA d'un taux sur la **fraction exacte** de la base,
 * et ne rend que la TVA : c'est la règle du bon, figée à la passation, et elle
 * ne bouge pas. La norme exige autre chose (plan
 * `documentation/comptabilite/facturation/simulateur-dossier-de-facturation.md`, D4,
 * §3.1) : par taux, la base marchandise, le montant de chaque remise et de
 * chaque frais **en centimes**, la base imposable **arrondie**, puis la TVA =
 * `arrondi(base imposable × taux)` (BR-S-09). Les deux règles donnent des
 * centimes différents ; mêler les deux dans une seule fonction aurait fait
 * dépendre le bon d'une option de facture.
 *
 * ## Elle ne répartit plus rien (2026-10-22)
 *
 * Remises et frais arrivent **déjà découpés par taux**, en centimes entiers :
 * chaque bon découpe les siens (`splitOrderByRate`), et l'appelant additionne
 * ces parts taux par taux (plan
 * `documentation/comptabilite/facturation/plan-remises-ventilees-bon-par-bon.md`, R3).
 * Une répartition faite ici, sur toutes les marchandises de la facture, faisait
 * glisser la remise d'un bon sur les taux d'un autre. Il ne reste qu'à poser,
 * par taux, la base imposable et sa TVA, calculée une fois (R4).
 *
 * Elle ne connaît aucune règle de facturation : quelles remises, quels frais,
 * sur quels bons — l'appelant le décide.
 */

/**
 * Une remise d'une **nature** (remise de retrait, bon de fidélité…), POSITIVE,
 * déjà découpée par taux en centimes. Une part sur un taux sans marchandise
 * est refusée : elle rendrait une base négative.
 */
export interface InvoiceAllowance {
  readonly key: string;
  readonly byRate: readonly RatedCents[];
}

/** Un frais hors remise (port, surtaxe), déjà découpé par taux en centimes. */
export interface InvoiceCharge {
  readonly key: string;
  readonly byRate: readonly RatedCents[];
}

/** Entrées de {@link invoiceVatBreakdown}. Tout est hors taxe, en centimes. */
export interface InvoiceVatInput {
  /** Les montants HT des lignes de la facture, déjà arrondis une fois chacun. */
  readonly goods: readonly VatLine[];
  readonly allowances: readonly InvoiceAllowance[];
  readonly charges: readonly InvoiceCharge[];
}

/** La part d'une remise ou d'un frais sur un taux. */
export interface InvoiceVatPart {
  readonly key: string;
  readonly amountCents: number;
}

/** Une catégorie de TVA de la facture — tout ce que la norme demande d'un taux. */
export interface InvoiceVatCategory {
  readonly rate: number;
  readonly goodsHtCents: number;
  /** Une part par remise de l'entrée, dans l'ordre de l'entrée, zéros compris. */
  readonly allowances: readonly InvoiceVatPart[];
  /** Une part par frais de l'entrée, dans l'ordre de l'entrée, zéros compris. */
  readonly charges: readonly InvoiceVatPart[];
  /** Marchandise − remises + frais, en centimes entiers. */
  readonly taxableBaseCents: number;
  /** `arrondi(base imposable × taux)`. */
  readonly vatCents: number;
}

/** La ventilation complète, en centimes entiers. */
export interface InvoiceVatBreakdown {
  /** Une catégorie par taux présent (marchandise ou frais), du plus bas au plus haut. */
  readonly categories: readonly InvoiceVatCategory[];
  readonly goodsHtCents: number;
  readonly allowancesCents: number;
  readonly chargesCents: number;
  /** Σ bases imposables — le total HT de la facture. */
  readonly taxableBaseCents: number;
  readonly vatCents: number;
  /** Total HT + Σ TVA — le TTC. */
  readonly totalCents: number;
}

/**
 * Ventile la TVA d'une facture, catégorie par catégorie.
 *
 * ⚠️ Une remise qui dépasse la marchandise de son taux — ou qui tombe sur un
 * taux sans marchandise — rendrait une base imposable négative : `RangeError`,
 * plutôt qu'un avoir déguisé en facture.
 */
export function invoiceVatBreakdown(input: InvoiceVatInput): InvoiceVatBreakdown {
  const goodsByRate = sumByRate(input.goods);
  const allowanceParts = input.allowances.map((allowance) => byRateOf(allowance.byRate));
  const chargeParts = input.charges.map((charge) => byRateOf(charge.byRate));
  const rates = new Set<number>(goodsByRate.keys());
  for (const parts of chargeParts) {
    for (const rate of parts.keys()) {
      rates.add(rate);
    }
  }
  ensureAllowancesFit(input.allowances, allowanceParts, goodsByRate);
  const categories = [...rates]
    .sort((left, right) => left - right)
    .map((rate) =>
      categoryOf(rate, goodsByRate.get(rate) ?? 0, {
        allowances: input.allowances.map((a, i) => partOf(a.key, allowanceParts[i], rate)),
        charges: input.charges.map((c, i) => partOf(c.key, chargeParts[i], rate)),
      }),
    );
  return totalsOf(categories);
}

function categoryOf(
  rate: number,
  goodsHtCents: number,
  parts: {
    readonly allowances: readonly InvoiceVatPart[];
    readonly charges: readonly InvoiceVatPart[];
  },
): InvoiceVatCategory {
  const taxableBaseCents = goodsHtCents - sumAmounts(parts.allowances) + sumAmounts(parts.charges);
  return {
    rate,
    goodsHtCents,
    allowances: parts.allowances,
    charges: parts.charges,
    taxableBaseCents,
    vatCents: vatOf(taxableBaseCents, rate),
  };
}

function totalsOf(categories: readonly InvoiceVatCategory[]): InvoiceVatBreakdown {
  const sum = (pick: (category: InvoiceVatCategory) => number): number =>
    categories.reduce((total, category) => total + pick(category), 0);
  const taxableBaseCents = sum((c) => c.taxableBaseCents);
  const vatCents = sum((c) => c.vatCents);
  return {
    categories,
    goodsHtCents: sum((c) => c.goodsHtCents),
    allowancesCents: sum((c) => sumAmounts(c.allowances)),
    chargesCents: sum((c) => sumAmounts(c.charges)),
    taxableBaseCents,
    vatCents,
    totalCents: taxableBaseCents + vatCents,
  };
}

function ensureAllowancesFit(
  allowances: readonly InvoiceAllowance[],
  parts: readonly ReadonlyMap<number, number>[],
  goodsByRate: ReadonlyMap<number, number>,
): void {
  const used = new Map<number, number>();
  parts.forEach((byRate, index) => {
    for (const [rate, cents] of byRate) {
      const total = (used.get(rate) ?? 0) + cents;
      used.set(rate, total);
      if (cents < 0 || total > (goodsByRate.get(rate) ?? 0)) {
        const key = allowances[index]?.key ?? "";
        throw new RangeError(
          `Remise « ${key} » au taux de ${String(rate)} % : elle dépasse la marchandise de ce taux.`,
        );
      }
    }
  });
}

function byRateOf(rated: readonly RatedCents[]): ReadonlyMap<number, number> {
  const byRate = new Map<number, number>();
  for (const part of rated) {
    byRate.set(part.vatRate, (byRate.get(part.vatRate) ?? 0) + Math.trunc(part.amountCents));
  }
  return byRate;
}

function partOf(
  key: string,
  parts: ReadonlyMap<number, number> | undefined,
  rate: number,
): InvoiceVatPart {
  return { key, amountCents: parts?.get(rate) ?? 0 };
}

function sumByRate(lines: readonly VatLine[]): Map<number, number> {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0) + Math.trunc(line.htCents));
  }
  return byRate;
}

function sumAmounts(parts: readonly InvoiceVatPart[]): number {
  return parts.reduce((total, part) => total + part.amountCents, 0);
}

/**
 * La TVA sur la base ARRONDIE (BR-S-09). Le taux passe en points de base par
 * un arrondi : `4.85 * 100` n'est pas un entier en binaire.
 */
function vatOf(taxableBaseCents: number, rate: number): number {
  return roundToCents(fractionByBasisPoints(fromCents(taxableBaseCents), Math.round(rate * 100)));
}
