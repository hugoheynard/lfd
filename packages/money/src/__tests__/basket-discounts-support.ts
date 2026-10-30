import type { BasketDiscountAdjustment } from "../basket-discounts.js";
import { splitCents } from "../order-vat-split.js";
import { ttcCentsFromHtMillicents } from "../tax.js";
import { taxMultiplierBp, ttcOfHtAmount } from "../ttc-of-ht-amount.js";
import { percentOf, type TtcOrderLine } from "../ttc-order.js";
import type { VatLine } from "../vat.js";

/**
 * Les formules de la remise UNIQUE, recopiées telles qu'elles étaient avant
 * le lot M1 (`pickupDiscountParts`, `ttc-order.ts` au commit `6b485ee03`, et
 * `discountCentsOf`, `@lfd/contracts`) : la référence contre laquelle la
 * liste de remises se mesure. Elles ne doivent plus bouger.
 */

/** La remise unique au chemin `exact_ht`, ventilée par taux (TTC). */
export function legacyExactDiscountParts(
  lines: readonly TtcOrderLine[],
  adjustment: BasketDiscountAdjustment,
): ReadonlyMap<number, number> {
  const eligible = new Map<number, bigint>();
  for (const line of lines) {
    if (line.discountEligible !== false) {
      const ttc = lineTtc(line);
      eligible.set(line.vatRate, (eligible.get(line.vatRate) ?? 0n) + BigInt(ttc));
    }
  }
  const base = [...eligible.values()].reduce((a, b) => a + b, 0n);
  if (base <= 0n) {
    return new Map();
  }
  if (adjustment.mode === "percent") {
    return splitCents(bounded(percentOf(base, adjustment.bp), base), eligible);
  }
  const cents = bounded(ttcOfHtAmount(adjustment.cents, eligible), base);
  const converted = new Map([...eligible].map(([r, w]) => [r, w * taxMultiplierBp(r)]));
  return splitCents(cents, converted);
}

/** `discountCentsOf(adjustment, Σ HT éligible)` — le montant d'hier au chemin `line_ht`. */
export function legacyLineHtDiscountCents(
  lines: readonly VatLine[],
  adjustment: BasketDiscountAdjustment,
): number {
  const base = lines
    .filter((line) => line.discountEligible !== false)
    .reduce((sum, line) => sum + line.htCents, 0);
  const raw =
    adjustment.mode === "amount"
      ? Math.max(0, adjustment.cents)
      : Math.max(0, Math.round((base * adjustment.bp) / 10000));
  return Math.min(raw, Math.max(0, base));
}

function lineTtc(line: TtcOrderLine): number {
  const label = ttcCentsFromHtMillicents(line.unitMillicents, line.vatRate);
  if (line.quantity.unit === "piece") {
    return label * line.quantity.amount;
  }
  return Number((BigInt(label) * BigInt(line.quantity.amount) + 500n) / 1000n);
}

function bounded(cents: number, available: bigint): number {
  return Math.min(Math.max(0, Math.trunc(cents)), Math.max(0, Number(available)));
}
