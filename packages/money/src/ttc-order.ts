import { fractionByBasisPoints, fromCents, roundToCents } from "./exact.js";
import { splitCents } from "./order-vat-split.js";
import { ttcCentsFromHtMillicents } from "./tax.js";
import { taxMultiplierBp, ttcOfHtAmount } from "./ttc-of-ht-amount.js";
import { allocateRateVat } from "./ttc-vat-allocation.js";
import { DELIVERY_VAT_RATE } from "./vat.js";

/**
 * **La commande d'un particulier, composée en TTC** — plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 4 et § 5 (voie B).
 *
 * Chaque terme est d'abord un TTC : la ligne vaut quantité × étiquette, la
 * remise retrait et le bon se prennent sur du TTC, le port est converti. Le
 * total est Σ de ces TTC — ce que le client lit, ce que Stripe prélève. La TVA
 * s'extrait ensuite par taux, au centime supérieur, se répartit sur les termes,
 * et le HT de chaque terme est le DERNIER nombre calculé.
 *
 * Son propre type d'entrée et de sortie : le calcul pro (`ventilateVat`,
 * `VatVentilation`) n'est ni lu ni touché.
 */

/** Une marchandise : prix résolu HT en millicentimes, quantité, taux. */
export interface TtcOrderLine {
  readonly unitMillicents: number;
  readonly quantity: number;
  readonly vatRate: number;
  /** Entre dans l'assiette de la remise retrait. Absent = éligible. */
  readonly discountEligible?: boolean | undefined;
}

/**
 * Un ajustement tel que saisi — la forme de `CartAdjustment` (`@lfd/contracts`),
 * redite ici parce que ce paquet n'a aucune dépendance. `cents` est HT.
 */
export type TtcOrderAdjustment =
  | { readonly mode: "percent"; readonly bp: number }
  | { readonly mode: "amount"; readonly cents: number };

/** Le port : son barème, et son taux — standard (20 %) ou celui de la marchandise. */
export interface TtcOrderDeliveryFee {
  readonly adjustment: TtcOrderAdjustment;
  readonly vatMode: "standard" | "followsGoods";
}

export interface TtcOrderInput {
  readonly lines: readonly TtcOrderLine[];
  readonly pickupDiscount?: TtcOrderAdjustment | undefined;
  /** Valeur faciale TTC du bon (§ 10, Q2), imputée sur le TTC restant, bornée. */
  readonly voucherCents?: number | undefined;
  readonly deliveryFee?: TtcOrderDeliveryFee | undefined;
}

/** La part d'un terme sur un taux. Montants positifs, même pour une remise. */
export interface TtcRatePart {
  readonly vatRate: number;
  readonly ttcCents: number;
  readonly vatCents: number;
  readonly htCents: number;
}

/** Un terme sans taux propre (remise, bon, port) : ses parts par taux et leurs sommes. */
export interface TtcComposedTerm {
  readonly ttcCents: number;
  readonly vatCents: number;
  readonly htCents: number;
  readonly parts: readonly TtcRatePart[];
}

export interface TtcComposedLine extends TtcRatePart {
  /** L'étiquette : `ttcCentsFromHtMillicents(prix, taux)`. */
  readonly labelCents: number;
}

/**
 * La commande composée. `pickupDiscount` et `voucher` se RETRANCHENT : leurs
 * montants sont positifs, comme les colonnes de remise d'aujourd'hui.
 * `total = Σ lignes − remise − bon + port`, et `total.ht + total.vat = total.ttc`.
 */
export interface TtcOrderComposition {
  readonly lines: readonly TtcComposedLine[];
  readonly pickupDiscount: TtcComposedTerm;
  readonly voucher: TtcComposedTerm;
  readonly deliveryFee: TtcComposedTerm;
  /** Par taux croissant : le net (lignes − remises + port). */
  readonly byRate: readonly TtcRatePart[];
  readonly total: {
    readonly ttcCents: number;
    readonly vatCents: number;
    readonly htCents: number;
  };
}

type RatedTtc = ReadonlyMap<number, number>;

/** Compose une commande de particulier — étapes 1 à 4 du § 4. */
export function composeTtcOrder(input: TtcOrderInput): TtcOrderComposition {
  const labels = input.lines.map((line) =>
    ttcCentsFromHtMillicents(line.unitMillicents, line.vatRate),
  );
  const lineTtcs = input.lines.map((line, i) => (labels[i] ?? 0) * Math.trunc(line.quantity));
  const gross = weightsOf(input.lines, lineTtcs, () => true);
  const eligible = weightsOf(input.lines, lineTtcs, (line) => line.discountEligible !== false);
  const discount = pickupDiscountParts(input.pickupDiscount, eligible);
  const net = new Map([...gross].map(([rate, w]) => [rate, w - BigInt(discount.get(rate) ?? 0)]));
  const voucherCents = bounded(input.voucherCents ?? 0, sum(net));
  const voucher = splitCents(voucherCents, net);
  const fee = deliveryFeeParts(input.deliveryFee, gross);
  return assemble(input.lines, labels, lineTtcs, { discount, voucher, fee });
}

function pickupDiscountParts(
  adjustment: TtcOrderAdjustment | undefined,
  eligible: ReadonlyMap<number, bigint>,
): RatedTtc {
  const base = sum(eligible);
  if (adjustment === undefined || base <= 0n) {
    return new Map();
  }
  if (adjustment.mode === "percent") {
    return splitCents(bounded(percentOf(base, adjustment.bp), base), eligible);
  }
  const cents = bounded(ttcOfHtAmount(adjustment.cents, eligible), base);
  return splitCents(cents, convertedWeights(eligible));
}

function deliveryFeeParts(
  fee: TtcOrderDeliveryFee | undefined,
  gross: ReadonlyMap<number, bigint>,
): RatedTtc {
  if (fee === undefined) {
    return new Map();
  }
  const follows = fee.vatMode === "followsGoods" && sum(gross) > 0n;
  const weights = follows ? gross : new Map([[DELIVERY_VAT_RATE, 1n]]);
  if (fee.adjustment.mode === "percent") {
    // R1 bis : le pourcentage s'applique au TTC des marchandises, sans conversion.
    return splitCents(percentOf(sum(gross), fee.adjustment.bp), weights);
  }
  const cents = Math.max(0, ttcOfHtAmount(fee.adjustment.cents, weights));
  return splitCents(cents, convertedWeights(weights));
}

/**
 * Le pourcentage d'un TTC, au plus proche, la moitié vers le haut — la règle
 * de `cartAdjustmentCents` (`@lfd/contracts`), tenue ici en entiers.
 *
 * Exportée pour une seule raison : ce paquet ne dépend pas de
 * `@lfd/contracts`, et le doublon est éprouvé là où les deux se voient — un
 * test de l'API compare les deux règles sur un balayage (plan du centime,
 * § 9 bis, lot C2).
 */
export function percentOf(baseCents: bigint, bp: number): number {
  return Math.max(0, roundToCents(fractionByBasisPoints(fromCents(Number(baseCents)), bp)));
}

/** Le poids de chaque taux une fois sa part HT convertie : `w × (1 + t)`. */
function convertedWeights(weights: ReadonlyMap<number, bigint>): ReadonlyMap<number, bigint> {
  return new Map([...weights].map(([rate, w]) => [rate, w * taxMultiplierBp(rate)]));
}

interface Adjustments {
  readonly discount: RatedTtc;
  readonly voucher: RatedTtc;
  readonly fee: RatedTtc;
}

function assemble(
  lines: readonly TtcOrderLine[],
  labels: readonly number[],
  lineTtcs: readonly number[],
  adjustments: Adjustments,
): TtcOrderComposition {
  const composed: TtcComposedLine[] = [];
  const discount: TtcRatePart[] = [];
  const voucher: TtcRatePart[] = [];
  const fee: TtcRatePart[] = [];
  const byRate: TtcRatePart[] = [];
  for (const rate of ratesOf(lines, adjustments)) {
    const indexes = lines.flatMap((line, i) => (line.vatRate === rate ? [i] : []));
    const allocated = allocateRateVat(
      [
        ...indexes.map((i) => lineTtcs[i] ?? 0),
        -(adjustments.discount.get(rate) ?? 0),
        -(adjustments.voucher.get(rate) ?? 0),
        adjustments.fee.get(rate) ?? 0,
      ],
      rate,
    );
    indexes.forEach((lineIndex, k) => {
      const term = allocated[k] ?? { ttcCents: 0, vatCents: 0, htCents: 0 };
      composed[lineIndex] = { ...term, vatRate: rate, labelCents: labels[lineIndex] ?? 0 };
    });
    const [discountTerm, voucherTerm, feeTerm] = allocated.slice(indexes.length);
    pushPart(discount, rate, discountTerm, -1);
    pushPart(voucher, rate, voucherTerm, -1);
    pushPart(fee, rate, feeTerm, 1);
    byRate.push(sumParts(rate, allocated));
  }
  return {
    lines: composed,
    pickupDiscount: termOf(discount),
    voucher: termOf(voucher),
    deliveryFee: termOf(fee),
    byRate,
    total: totalOf(byRate),
  };
}

function ratesOf(lines: readonly TtcOrderLine[], adjustments: Adjustments): readonly number[] {
  const rates = new Set(lines.map((line) => line.vatRate));
  for (const rate of adjustments.fee.keys()) {
    rates.add(rate);
  }
  return [...rates].sort((a, b) => a - b);
}

function pushPart(
  target: TtcRatePart[],
  vatRate: number,
  term:
    { readonly ttcCents: number; readonly vatCents: number; readonly htCents: number } | undefined,
  sign: 1 | -1,
): void {
  if (term !== undefined && term.ttcCents !== 0) {
    target.push({
      vatRate,
      ttcCents: sign * term.ttcCents,
      vatCents: sign * term.vatCents,
      htCents: sign * term.htCents,
    });
  }
}

function sumParts(
  vatRate: number,
  terms: readonly {
    readonly ttcCents: number;
    readonly vatCents: number;
    readonly htCents: number;
  }[],
): TtcRatePart {
  return terms.reduce<TtcRatePart>(
    (acc, t) => ({
      vatRate,
      ttcCents: acc.ttcCents + t.ttcCents,
      vatCents: acc.vatCents + t.vatCents,
      htCents: acc.htCents + t.htCents,
    }),
    { vatRate, ttcCents: 0, vatCents: 0, htCents: 0 },
  );
}

function totalOf(byRate: readonly TtcRatePart[]): TtcOrderComposition["total"] {
  const { ttcCents, vatCents, htCents } = sumParts(0, byRate);
  return { ttcCents, vatCents, htCents };
}

function termOf(parts: readonly TtcRatePart[]): TtcComposedTerm {
  const { ttcCents, vatCents, htCents } = sumParts(0, parts);
  return { ttcCents, vatCents, htCents, parts };
}

function weightsOf(
  lines: readonly TtcOrderLine[],
  ttcs: readonly number[],
  keep: (line: TtcOrderLine) => boolean,
): Map<number, bigint> {
  const byRate = new Map<number, bigint>();
  lines.forEach((line, i) => {
    if (keep(line)) {
      byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0n) + BigInt(ttcs[i] ?? 0));
    }
  });
  return byRate;
}

function bounded(cents: number, available: bigint): number {
  return Math.min(Math.max(0, Math.trunc(cents)), Math.max(0, Number(available)));
}

function sum(weights: ReadonlyMap<number, bigint>): bigint {
  let total = 0n;
  for (const weight of weights.values()) {
    total += weight;
  }
  return total;
}
