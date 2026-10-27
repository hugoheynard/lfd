import { htMillicentsOf } from "../tax.js";
import type { TtcOrderComposition, TtcOrderInput, TtcOrderLine } from "../ttc-order.js";

/** Une ligne dont l'étiquette vaut `labelCents` au taux donné. */
export function labelled(
  labelCents: number,
  vatRate: number,
  quantity = 1,
  discountEligible?: boolean,
): TtcOrderLine {
  const unitMillicents = htMillicentsOf(labelCents, vatRate) ?? 0;
  return discountEligible === undefined
    ? { unitMillicents, quantity, vatRate }
    : { unitMillicents, quantity, vatRate, discountEligible };
}

/** Les invariants du § 4, rendus en liste de violations (vide = tenu). */
export function violations(input: TtcOrderInput, result: TtcOrderComposition): readonly string[] {
  const found: string[] = [];
  const goods = result.lines.reduce((sum, line, i) => {
    const quantity = input.lines[i]?.quantity ?? 0;
    if (line.ttcCents !== quantity * line.labelCents)
      found.push(`ligne ${i} ≠ quantité × étiquette`);
    return sum + line.ttcCents;
  }, 0);
  const expected =
    goods - result.pickupDiscount.ttcCents - result.voucher.ttcCents + result.deliveryFee.ttcCents;
  if (result.total.ttcCents !== expected)
    found.push(`total ${result.total.ttcCents} ≠ ${expected}`);
  if (result.total.htCents + result.total.vatCents !== result.total.ttcCents)
    found.push("HT + TVA ≠ TTC");
  for (const share of result.byRate) {
    const bp = BigInt(Math.round(share.vatRate * 100));
    if (BigInt(share.vatCents) * 10_000n < BigInt(share.htCents) * bp)
      found.push(`TVA < HT × ${share.vatRate}`);
  }
  const parts = [
    ...result.lines,
    ...result.pickupDiscount.parts,
    ...result.voucher.parts,
    ...result.deliveryFee.parts,
  ];
  for (const part of parts) {
    if (part.ttcCents * part.htCents < 0 || (part.ttcCents === 0 && part.vatCents !== 0)) {
      found.push(`HT ${part.htCents} contraire au TTC ${part.ttcCents}`);
    }
  }
  const htSum =
    result.lines.reduce((s, l) => s + l.htCents, 0) -
    result.pickupDiscount.htCents -
    result.voucher.htCents +
    result.deliveryFee.htCents;
  if (htSum !== result.total.htCents) found.push("Σ HT des termes ≠ HT total");
  return found;
}

/** Un générateur pseudo-aléatoire à graine fixe (mulberry32) : le balayage se rejoue. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
