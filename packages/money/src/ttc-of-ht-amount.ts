import { roundToCents } from "./exact.js";

/**
 * **Un montant fixe saisi HT, rendu en TTC** — la conversion nommée du plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 5, R1 et R2).
 *
 * Les réglages restent saisis HT (frais de zone, remise retrait en montant
 * fixe) ; une commande de particulier, construite en TTC, les applique en TTC.
 * Devis, agrégat, révision et bon de livraison appellent CETTE fonction : trois
 * traductions finiraient par diverger.
 *
 * Le montant HT est découpé au prorata des poids, chaque part convertie à son
 * taux, et la somme n'est arrondie **qu'une fois** (au plus proche, la moitié
 * s'éloignant de zéro).
 */

const BP_PER_UNIT = 10_000n;

/** Le taux en points de base entiers : `5,5` → `550` — `Math.round` sur le pourcentage, comme `tax.ts`. */
export function rateBp(ratePercent: number): bigint {
  return BigInt(Math.round(ratePercent * 100));
}

/** Le multiplicateur `1 + taux` en points de base : `5,5` → `10 550`. */
export function taxMultiplierBp(ratePercent: number): bigint {
  return BP_PER_UNIT + rateBp(ratePercent);
}

/**
 * Convertit `htCents` en TTC au prorata de `weights` (taux → poids entier,
 * par exemple le TTC éligible de chaque taux).
 *
 * @throws {RangeError} sans aucun poids positif : convertir sans taux ferait
 *   payer un montant que personne n'a décidé ; l'appelant ne convertit rien.
 */
export function ttcOfHtAmount(htCents: number, weights: ReadonlyMap<number, bigint>): number {
  let sum = 0n;
  let num = 0n;
  for (const [rate, weight] of weights) {
    if (weight > 0n) {
      sum += weight;
      num += weight * taxMultiplierBp(rate);
    }
  }
  if (sum === 0n) {
    throw new RangeError("Conversion HT → TTC sans aucun taux pondéré.");
  }
  return roundToCents({ num: BigInt(Math.trunc(htCents)) * num, den: sum * BP_PER_UNIT });
}
