import { fractionByBasisPoints, fromCents, roundToCents } from "./exact.js";
import { DELIVERY_VAT_RATE, type VatLine } from "./vat.js";

/**
 * **La ventilation de TVA d'une FACTURE** — au sens de la norme EN 16931, que
 * suivent Factur-X et CII.
 *
 * ## Pourquoi une seconde fonction, et pas `ventilateVat`
 *
 * `ventilateVat` calcule la TVA d'un taux sur la **fraction exacte** de la base,
 * et ne rend que la TVA : c'est la règle du bon, figée à la passation, et elle
 * ne bouge pas. La norme exige autre chose (plan
 * `documentation/facturation/plan-simulateur-dossier-de-facturation.md`, D4,
 * §3.1) : par taux, la base marchandise, le montant de chaque remise et de
 * chaque frais **en centimes**, la base imposable **arrondie**, puis la TVA =
 * `arrondi(base imposable × taux)` (BR-S-09). Les deux règles donnent des
 * centimes différents ; mêler les deux dans une seule fonction aurait fait
 * dépendre le bon d'une option de facture.
 *
 * ## Les répartitions, aux plus forts restes
 *
 * Une remise ou un port qui suit la marchandise se répartit au prorata des
 * bases, **en centimes entiers** : chaque taux reçoit sa part plancher, puis les
 * centimes restants vont aux plus forts restes — à égalité, au taux le plus
 * élevé d'abord. La somme des parts vaut alors le montant, exactement : une
 * facture dont les remises par taux ne retombent pas sur la remise totale est
 * refusée par un validateur.
 *
 * Elle ne connaît aucune règle de facturation : quelles remises, quels frais,
 * quel port suit quelles marchandises — l'appelant le décide.
 */

/** Une remise d'une **nature** (remise société, bon de fidélité…), POSITIVE, en centimes. */
export interface InvoiceAllowance {
  readonly key: string;
  readonly amountCents: number;
}

/**
 * Un frais hors remise, en centimes : soit à son propre taux, soit réparti au
 * prorata de bases marchandise **fournies par l'appelant** — celles des seuls
 * bons dont le port suit la vente, pas celles de toute la facture.
 */
export type InvoiceCharge =
  | { readonly key: string; readonly htCents: number; readonly vatRate: number }
  | { readonly key: string; readonly htCents: number; readonly prorataBases: readonly VatLine[] };

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
 * ⚠️ Une remise sur une facture **sans marchandise** n'a aucune base où se
 * répartir : `RangeError`, plutôt qu'une remise qui disparaîtrait du calcul.
 * Un frais au prorata de bases toutes nulles prend, lui, le taux normal — la
 * même règle que `ventilateVat`.
 */
export function invoiceVatBreakdown(input: InvoiceVatInput): InvoiceVatBreakdown {
  const goodsByRate = sumByRate(input.goods);
  const allowanceParts = input.allowances.map((allowance) =>
    allocateAllowance(allowance, goodsByRate),
  );
  const chargeParts = input.charges.map(allocateCharge);
  const rates = new Set<number>(goodsByRate.keys());
  for (const parts of chargeParts) {
    for (const rate of parts.keys()) {
      rates.add(rate);
    }
  }
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

function allocateAllowance(
  allowance: InvoiceAllowance,
  goodsByRate: ReadonlyMap<number, number>,
): ReadonlyMap<number, number> {
  if (allowance.amountCents !== 0 && totalWeight(goodsByRate) === 0) {
    throw new RangeError(`Remise « ${allowance.key} » sans aucune marchandise où la répartir.`);
  }
  return allocateLargestRemainder(allowance.amountCents, goodsByRate);
}

function allocateCharge(charge: InvoiceCharge): ReadonlyMap<number, number> {
  if ("vatRate" in charge) {
    return new Map([[charge.vatRate, charge.htCents]]);
  }
  const bases = sumByRate(charge.prorataBases);
  if (totalWeight(bases) === 0) {
    return new Map([[DELIVERY_VAT_RATE, charge.htCents]]);
  }
  return allocateLargestRemainder(charge.htCents, bases);
}

/**
 * Répartit `amountCents` au prorata de `weights`, en centimes entiers : les
 * planchers, puis un centime par plus fort reste — à égalité, taux le plus
 * élevé d'abord. Σ des parts = `amountCents`, exactement. En `bigint` : le
 * produit montant × poids n'a pas à rester sous `MAX_SAFE_INTEGER`.
 */
function allocateLargestRemainder(
  amountCents: number,
  weights: ReadonlyMap<number, number>,
): ReadonlyMap<number, number> {
  const total = BigInt(totalWeight(weights));
  const parts = new Map<number, number>();
  if (total === 0n) {
    return parts;
  }
  const amount = BigInt(Math.trunc(amountCents));
  const remainders: { readonly rate: number; readonly remainder: bigint }[] = [];
  let allocated = 0n;
  for (const [rate, weight] of weights) {
    const numerator = amount * BigInt(weight);
    const floor = numerator / total;
    parts.set(rate, Number(floor));
    allocated += floor;
    remainders.push({ rate, remainder: numerator % total });
  }
  remainders.sort((left, right) =>
    left.remainder === right.remainder
      ? right.rate - left.rate
      : left.remainder > right.remainder
        ? -1
        : 1,
  );
  for (let left = amount - allocated, i = 0; left > 0n; left -= 1n, i += 1) {
    const rate = remainders[i % remainders.length]?.rate ?? 0;
    parts.set(rate, (parts.get(rate) ?? 0) + 1);
  }
  return parts;
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

function totalWeight(weights: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const weight of weights.values()) {
    total += weight;
  }
  return total;
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
