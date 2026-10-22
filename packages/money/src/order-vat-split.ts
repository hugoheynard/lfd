import { DELIVERY_VAT_RATE, type VatExtra, type VatLine, type VatVentilationInput } from "./vat.js";

/**
 * **Le découpage d'un bon par taux, en centimes entiers** — ce que la facture
 * additionne (plan
 * `documentation/comptabilite/facturation/plan-remises-ventilees-bon-par-bon.md`, R1-R2).
 *
 * ## Pourquoi par bon, et pas sur le cycle
 *
 * `ventilateVat` répartit les remises et le port **sur le bon** : la remise de
 * retrait sur ses lignes éligibles, le bon de fidélité sur ce qu'elle a laissé,
 * le port qui suit la marchandise sur ses bases brutes. Une facture qui
 * répartirait les mêmes montants une fois sur toutes les marchandises du cycle
 * ferait glisser une remise du pain d'un bon sur les boissons d'un autre — un
 * écart de COMPOSITION, rangé à tort en « arrondi ». Chaque bon se découpe donc
 * lui-même, dans le même ordre et avec les mêmes bornes que `ventilateVat`.
 *
 * ## L'arrondi : au plus fort reste, égalité par taux croissant
 *
 * Le bon garde des fractions exactes ; la facture veut des centimes (BT-92 par
 * taux). Chaque montant est découpé en parts planchers, puis les centimes
 * restants vont aux plus fortes fractions — à égalité, au taux le plus bas
 * d'abord. La somme des parts vaut le montant, exactement (BR-CO-11).
 *
 * ⚠️ Le bon de fidélité se découpe sur le net **en centimes** que la remise de
 * retrait a laissé à chaque taux (`brut − part entière de la remise`), pas sur
 * la fraction exacte : c'est la seule assiette qui garantit qu'aucun taux ne
 * reçoit plus de remise qu'il n'a de marchandise — une base imposable négative.
 * L'écart avec la fraction exacte est inférieur au centime par taux.
 */

/** Un montant en centimes sur un taux. */
export interface RatedCents {
  readonly vatRate: number;
  readonly amountCents: number;
}

/** Les parts d'un bon par taux, du plus bas au plus haut, sans part nulle. */
export interface OrderVatSplit {
  /** La remise d'assiette restreinte (le retrait), telle qu'appliquée — bornée. */
  readonly eligibleDiscount: readonly RatedCents[];
  /** La remise sur toutes les lignes (le bon de fidélité), telle qu'appliquée — bornée. */
  readonly discount: readonly RatedCents[];
  /** Une entrée par extra de l'entrée, dans son ordre. */
  readonly extras: readonly (readonly RatedCents[])[];
}

/**
 * Découpe les remises et les extras d'un bon par taux, dans l'ordre et avec les
 * bornes de `ventilateVat` : la remise restreinte bornée au HT éligible, le bon
 * de fidélité au net restant.
 */
export function splitOrderByRate(input: VatVentilationInput): OrderVatSplit {
  const gross = weightsOf(input.lines, () => true);
  const eligible = weightsOf(input.lines, (line) => line.discountEligible !== false);
  const eligibleCents = bounded(input.eligibleDiscountCents ?? 0, total(eligible));
  const eligibleParts = splitCents(eligibleCents, eligible);
  const net = new Map<number, bigint>();
  for (const [rate, weight] of gross) {
    net.set(rate, weight - BigInt(eligibleParts.get(rate) ?? 0));
  }
  const discountCents = bounded(input.discountCents, total(net));
  return {
    eligibleDiscount: toRated(eligibleParts),
    discount: toRated(splitCents(discountCents, net)),
    extras: input.extras.map((extra) => toRated(splitExtra(extra, gross))),
  };
}

/**
 * Répartit `amountCents` au prorata de `weights`, en centimes entiers : les
 * planchers, puis un centime par plus fort reste — à égalité, taux le plus bas
 * d'abord. Σ des parts = `amountCents`. Sans poids, rien ne se répartit.
 */
export function splitCents(
  amountCents: number,
  weights: ReadonlyMap<number, bigint>,
): ReadonlyMap<number, number> {
  const sum = total(weights);
  const parts = new Map<number, number>();
  if (sum <= 0n) {
    return parts;
  }
  const amount = BigInt(Math.trunc(amountCents));
  const remainders: { readonly rate: number; readonly remainder: bigint }[] = [];
  let left = amount;
  for (const [rate, weight] of weights) {
    if (weight <= 0n) {
      continue;
    }
    const numerator = amount * weight;
    parts.set(rate, Number(numerator / sum));
    left -= numerator / sum;
    remainders.push({ rate, remainder: numerator % sum });
  }
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.rate - b.rate : a.remainder > b.remainder ? -1 : 1,
  );
  for (let i = 0; left > 0n; left -= 1n, i += 1) {
    const rate = remainders[i % remainders.length]?.rate ?? DELIVERY_VAT_RATE;
    parts.set(rate, (parts.get(rate) ?? 0) + 1);
  }
  return parts;
}

function splitExtra(
  extra: VatExtra,
  gross: ReadonlyMap<number, bigint>,
): ReadonlyMap<number, number> {
  const ht = Math.trunc(extra.htCents);
  if ("vatRate" in extra) {
    return new Map([[extra.vatRate, ht]]);
  }
  // Sans marchandise, le port qui suit la vente prend le taux normal — la
  // règle de `ventilateVat`.
  return total(gross) === 0n ? new Map([[DELIVERY_VAT_RATE, ht]]) : splitCents(ht, gross);
}

function weightsOf(
  lines: readonly VatLine[],
  keep: (line: VatLine) => boolean,
): Map<number, bigint> {
  const byRate = new Map<number, bigint>();
  for (const line of lines) {
    if (keep(line)) {
      byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0n) + BigInt(Math.trunc(line.htCents)));
    }
  }
  return byRate;
}

function bounded(cents: number, available: bigint): number {
  return Math.min(Math.max(0, Math.trunc(cents)), Math.max(0, Number(available)));
}

function total(weights: ReadonlyMap<number, bigint>): bigint {
  let sum = 0n;
  for (const weight of weights.values()) {
    sum += weight;
  }
  return sum;
}

function toRated(parts: ReadonlyMap<number, number>): readonly RatedCents[] {
  return [...parts.entries()]
    .filter(([, amountCents]) => amountCents !== 0)
    .sort(([left], [right]) => left - right)
    .map(([vatRate, amountCents]) => ({ vatRate, amountCents }));
}
