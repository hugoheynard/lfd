import { fractionByBasisPoints, roundToCents } from "./exact.js";
import { MILLICENTS_PER_CENT, lineTotalCents } from "./millicents.js";
import { splitOrderByRate } from "./order-vat-split.js";
import { DELIVERY_VAT_RATE, type VatExtra, type VatShare, type VatVentilation } from "./vat.js";

/**
 * **La ventilation du particulier** — la somme des étiquettes, au centime.
 *
 * Plan `documentation/pricing/plan-centime-particuliers.md` (§ 3, lot C1). Le
 * calcul pro ({@link ventilateVat}) arrondit le HT de chaque ligne au centime,
 * PUIS taxe l'assiette : 21,00 € TTC à 5,5 % y deviennent 21,01 €. Ici, le TTC
 * de chaque taux part du HT **exact** (prix unitaire en millicentimes ×
 * quantité), remises au prorata, et n'est arrondi qu'une fois.
 *
 * 🔴 Le HT par taux reste celui de la commande — Σ des HT de lignes arrondis,
 * moins les remises découpées par {@link splitOrderByRate} — et la TVA est la
 * DIFFÉRENCE `TTC − HT`. C'est ce qui garde `HT + TVA = TTC` à l'en-tête
 * (objection B1 de `vitruve`). Le prix : une TVA qui n'est plus toujours
 * `HT × taux` arrondi (1,41 € HT, 0,09 € de TVA sur trois articles à 0,50 €).
 *
 * ⚠️ **Sans appelant** au lot C1 : le pro ne la lit jamais.
 */

/** Une marchandise en millicentimes : le HT de ligne arrondi s'en déduit, il ne se fournit pas. */
export interface ExactVatLine {
  readonly unitMillicents: number;
  readonly quantity: number;
  readonly vatRate: number;
  /** Même sens que `VatLine.discountEligible` : absent = éligible. */
  readonly discountEligible?: boolean | undefined;
}

/** Entrées de {@link ventilateVatExact} — les mêmes que `VatVentilationInput`, lignes exceptées. */
export interface ExactVatVentilationInput {
  readonly lines: readonly ExactVatLine[];
  readonly eligibleDiscountCents?: number | undefined;
  readonly discountCents: number;
  readonly extras: readonly VatExtra[];
}

/** Des montants exacts par ligne : `nums[i] / den` centimes. */
interface ExactNets {
  readonly nums: readonly bigint[];
  readonly den: bigint;
}

/**
 * Ventile la TVA d'un panier de particulier : un arrondi par taux, sur le TTC.
 *
 * Remises : mêmes montants et mêmes bornes que `ventilateVat` (bornées au HT
 * ARRONDI de leur assiette), seul leur prorata se fait sur le HT exact. Une
 * remise qui couvre toute son assiette la solde exactement — un bon qui
 * couvre tout ne laisse pas 0,01 € à prélever (objection B2).
 */
export function ventilateVatExact(input: ExactVatVentilationInput): VatVentilation {
  const rounded = input.lines.map((line) => ({
    htCents: lineTotalCents(line.unitMillicents, line.quantity),
    vatRate: line.vatRate,
    discountEligible: line.discountEligible,
  }));
  const asRounded = { ...input, lines: rounded };
  const subtotalHtCents = sum(rounded.map((line) => line.htCents));
  const extrasHtCents = sum(input.extras.map((extra) => Math.trunc(extra.htCents)));
  const eligibleAvailable = sum(
    rounded.filter((line) => line.discountEligible !== false).map((line) => line.htCents),
  );
  const eligibleApplied = bounded(input.eligibleDiscountCents ?? 0, eligibleAvailable);
  const discountApplied = bounded(input.discountCents, subtotalHtCents - eligibleApplied);

  let nets: ExactNets = {
    nums: input.lines.map(
      (line) => BigInt(Math.trunc(line.unitMillicents)) * BigInt(Math.trunc(line.quantity)),
    ),
    den: BigInt(MILLICENTS_PER_CENT),
  };
  nets = applyDiscount(
    nets,
    input.lines.map((line) => line.discountEligible !== false),
    eligibleApplied,
    eligibleAvailable,
  );
  nets = applyDiscount(
    nets,
    input.lines.map(() => true),
    discountApplied,
    subtotalHtCents - eligibleApplied,
  );

  const ttcByRate = exactTtcByRate(input, rounded, nets);
  const htByRate = htCentsByRate(asRounded);
  const vat = [...ttcByRate.entries()]
    .map(([rate, ttc]): VatShare => ({ rate, amountCents: ttc - (htByRate.get(rate) ?? 0) }))
    .filter((share) => share.amountCents !== 0)
    .sort((left, right) => left.rate - right.rate);
  const vatTotalCents = sum(vat.map((share) => share.amountCents));
  const discountCents = eligibleApplied + discountApplied;
  return {
    subtotalHtCents,
    discountCents,
    extrasHtCents,
    vat,
    vatTotalCents,
    totalCents: subtotalHtCents - discountCents + extrasHtCents + vatTotalCents,
  };
}

/**
 * Retranche `applied` centimes des lignes de l'assiette, au prorata de leur net
 * exact. Une remise qui atteint la borne ARRONDIE de l'assiette — ou qui
 * dépasserait son net exact, les arrondis de ligne ayant pu le gonfler — la
 * met à zéro : jamais de base négative.
 */
function applyDiscount(
  nets: ExactNets,
  inScope: readonly boolean[],
  applied: number,
  availableCents: number,
): ExactNets {
  if (applied === 0) {
    return nets;
  }
  const base = nets.nums.reduce((acc, num, index) => (inScope[index] ? acc + num : acc), 0n);
  const kept = base - BigInt(applied) * nets.den;
  if (applied >= availableCents || kept <= 0n || base === 0n) {
    return { nums: nets.nums.map((num, index) => (inScope[index] ? 0n : num)), den: nets.den };
  }
  return {
    nums: nets.nums.map((num, index) => (inScope[index] ? num * kept : num * base)),
    den: nets.den * base,
  };
}

/**
 * Le TTC de chaque taux, arrondi UNE fois : marchandises nettes exactes, plus
 * les extras traités comme `ventilateVat` — à taux propre dans leur groupe,
 * « suit la marchandise » au prorata du HT BRUT arrondi de chaque taux, taux
 * normal sans marchandise.
 */
function exactTtcByRate(
  input: ExactVatVentilationInput,
  rounded: readonly { readonly htCents: number; readonly vatRate: number }[],
  nets: ExactNets,
): ReadonlyMap<number, number> {
  const gross = new Map<number, bigint>();
  for (const line of rounded) {
    gross.set(line.vatRate, (gross.get(line.vatRate) ?? 0n) + BigInt(line.htCents));
  }
  for (const [rate, value] of gross) {
    if (value === 0n) {
      gross.delete(rate);
    }
  }
  const grossTotal = [...gross.values()].reduce((acc, value) => acc + value, 0n);
  const scale = grossTotal === 0n ? 1n : grossTotal;
  const den = nets.den * scale;
  const numByRate = new Map<number, bigint>();
  input.lines.forEach((line, index) => {
    addTo(numByRate, line.vatRate, (nets.nums[index] ?? 0n) * scale);
  });
  for (const extra of input.extras) {
    addExtra(numByRate, extra, { den, netDen: nets.den }, gross);
  }
  const ttc = new Map<number, number>();
  for (const [rate, num] of numByRate) {
    ttc.set(rate, roundToCents(fractionByBasisPoints({ num, den }, multiplierBp(rate))));
  }
  return ttc;
}

function addExtra(
  byRate: Map<number, bigint>,
  extra: VatExtra,
  dens: { readonly den: bigint; readonly netDen: bigint },
  gross: ReadonlyMap<number, bigint>,
): void {
  const ht = BigInt(Math.trunc(extra.htCents));
  if ("vatRate" in extra) {
    addTo(byRate, extra.vatRate, ht * dens.den);
    return;
  }
  if (gross.size === 0) {
    addTo(byRate, DELIVERY_VAT_RATE, ht * dens.den);
    return;
  }
  for (const [rate, value] of gross) {
    addTo(byRate, rate, ht * value * dens.netDen);
  }
}

/**
 * Le HT en centimes de chaque taux : brut arrondi des lignes, moins les
 * remises, plus les extras — découpés par `splitOrderByRate`, la règle déjà
 * tenue pour la facture. Σ = net HT + extras, au centime.
 */
function htCentsByRate(input: Parameters<typeof splitOrderByRate>[0]): ReadonlyMap<number, number> {
  const split = splitOrderByRate(input);
  const byRate = new Map<number, number>();
  const bump = (rate: number, cents: number): void => {
    byRate.set(rate, (byRate.get(rate) ?? 0) + cents);
  };
  for (const line of input.lines) {
    bump(line.vatRate, line.htCents);
  }
  for (const part of [...split.eligibleDiscount, ...split.discount]) {
    bump(part.vatRate, -part.amountCents);
  }
  for (const part of split.extras.flat()) {
    bump(part.vatRate, part.amountCents);
  }
  return byRate;
}

function multiplierBp(rate: number): number {
  return 10_000 + Math.round(rate * 100);
}

function bounded(cents: number, available: number): number {
  return Math.min(Math.max(0, Math.trunc(cents)), Math.max(0, available));
}

function addTo(byRate: Map<number, bigint>, rate: number, numerator: bigint): void {
  byRate.set(rate, (byRate.get(rate) ?? 0n) + numerator);
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
