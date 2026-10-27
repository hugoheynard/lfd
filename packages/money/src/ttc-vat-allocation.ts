import { roundToCents } from "./exact.js";
import { rateBp, taxMultiplierBp } from "./ttc-of-ht-amount.js";

/**
 * **La TVA d'un taux, extraite de son TTC puis répartie sur ses termes** —
 * étapes 2 à 4 du § 4 de `documentation/pricing/plan-centime-particuliers.md`.
 *
 * - TVA du taux = ⌈TTC × t / (1 + t)⌉ : jamais moins que HT net × t ;
 * - chaque terme reçoit l'arrondi commercial de la TVA qu'il CONTIENT (signée :
 *   une remise contient une TVA négative) ;
 * - l'écart se distribue un centime à la fois — positif aux plus grands restes,
 *   négatif aux plus petits —, l'ordre des termes départageant l'égalité ;
 * - un terme à TTC nul ne reçoit rien, et aucun centime ne rend un HT de signe
 *   contraire à son TTC.
 *
 * Pondérer par la TVA contenue, pas par le TTC : un bon qui solde (TTC net 0)
 * ne divise par rien.
 */

/** Un terme d'un taux, avec sa TVA et son HT. TTC signé. */
export interface AllocatedTerm {
  readonly ttcCents: number;
  readonly vatCents: number;
  readonly htCents: number;
}

/** La TVA d'un taux, au centime supérieur, en entiers. */
export function rateVatCents(ttcCents: number, ratePercent: number): number {
  return Number(ceilDiv(BigInt(ttcCents) * rateBp(ratePercent), taxMultiplierBp(ratePercent)));
}

/**
 * Répartit la TVA du taux sur `termTtcCents` (dans l'ordre de départage) et
 * rend, dans le même ordre, TTC, TVA et HT de chaque terme.
 *
 * @throws {RangeError} si un centime d'écart ne trouve aucun terme qui puisse
 *   le recevoir — un état que la composition ne produit pas.
 */
export function allocateRateVat(
  termTtcCents: readonly number[],
  ratePercent: number,
): readonly AllocatedTerm[] {
  const den = taxMultiplierBp(ratePercent);
  const bp = rateBp(ratePercent);
  const vats: number[] = [];
  const remainders: bigint[] = [];
  for (const ttc of termTtcCents) {
    const contained = BigInt(ttc) * bp;
    const rounded = roundToCents({ num: contained, den });
    vats.push(rounded);
    remainders.push(contained - BigInt(rounded) * den);
  }
  const total = termTtcCents.reduce((sum, ttc) => sum + ttc, 0);
  const gap = rateVatCents(total, ratePercent) - vats.reduce((sum, vat) => sum + vat, 0);
  distributeGap(termTtcCents, vats, remainders, gap);
  return termTtcCents.map((ttcCents, i) => {
    const vatCents = vats[i] ?? 0;
    return { ttcCents, vatCents, htCents: ttcCents - vatCents };
  });
}

function distributeGap(
  ttcs: readonly number[],
  vats: number[],
  remainders: readonly bigint[],
  gap: number,
): void {
  const step = gap > 0 ? 1 : -1;
  const order = ttcs
    .map((_, i) => i)
    .filter((i) => ttcs[i] !== 0)
    .sort((a, b) => compareRemainders(remainders[a] ?? 0n, remainders[b] ?? 0n, step) || a - b);
  let left = Math.abs(gap);
  while (left > 0) {
    const taken = order.some((i) => {
      if (!canTake(ttcs[i] ?? 0, (vats[i] ?? 0) + step)) {
        return false;
      }
      vats[i] = (vats[i] ?? 0) + step;
      left -= 1;
      return left === 0;
    });
    if (!taken && !order.some((i) => canTake(ttcs[i] ?? 0, (vats[i] ?? 0) + step))) {
      throw new RangeError("Écart de TVA sans terme pour le recevoir.");
    }
  }
}

/** Plus grands restes d'abord pour un écart positif, plus petits pour un négatif. */
function compareRemainders(a: bigint, b: bigint, step: 1 | -1): number {
  if (a === b) {
    return 0;
  }
  return (a > b ? -1 : 1) * step;
}

/** Le HT (TTC − TVA) reste du signe du TTC, ou nul. */
function canTake(ttc: number, vat: number): boolean {
  const ht = ttc - vat;
  return ttc > 0 ? ht >= 0 : ht <= 0;
}

function ceilDiv(num: bigint, den: bigint): bigint {
  const quotient = num / den;
  return num % den !== 0n && num > 0n ? quotient + 1n : quotient;
}
