import { divideByBasisPoints, fractionByBasisPoints, fromCents, roundToCents } from "@lfd/money";
import { z } from "zod";

/**
 * **L'assiette d'un prix** — ce que le nombre saisi veut dire.
 *
 * `ht` : le prix est hors taxe, et le TTC se calcule. C'est l'assiette
 * historique du référentiel, celle d'une facture professionnelle.
 *
 * `ttc` : le prix est celui de l'étiquette, et **c'est le HT qui se calcule** —
 * différemment pour chaque taux. Le même croissant est à 1,20 € qu'on
 * l'emporte (5,5 %) ou qu'on le mange en salle (10 %) : le prix affiché ne
 * bouge pas, la part de taxe si.
 *
 * Le référentiel porte UN prix par déclinaison et N taux par contexte : c'est
 * exactement la forme qu'un ancrage TTC demande. Seule la signification du
 * nombre change — aucune table « prix par contexte » n'est nécessaire.
 */
export const PRICE_BASES = ["ht", "ttc"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];
export const priceBasisSchema = z.enum(PRICE_BASES);

/**
 * Le **multiplicateur** du taux, en points de base entiers : `5,5 %` → `10 550`.
 *
 * Repasser par l'entier avant de diviser : `1 + 5.5 / 100` ne vaut pas
 * exactement `1,055` en binaire, et l'écart se propage dans une division.
 * `Math.round` sur le pourcentage plutôt que sur son produit — `5.5 * 100`
 * vaut `550.0000000000001`, et la troncature naïve rendrait `550` ici mais
 * `484` pour `4,85 %`. Le référentiel a déjà payé ce piège une fois, dans
 * `VatPercent`.
 */
const BP_PER_UNIT = 10_000;
function taxMultiplierBp(ratePercent: number): number {
  return BP_PER_UNIT + Math.round(ratePercent * 100);
}

/**
 * Le HT que ce taux déduit d'un prix TTC — tous deux en centimes entiers.
 *
 * **Le TTC fait foi.** C'est le nombre qu'un client lit sur l'étiquette et que
 * la caisse encaisse ; le HT en est la conséquence comptable. L'aller-retour
 * `ttcFromHt(htFromTtc(x))` ne rend donc pas toujours `x` exactement — un
 * centime peut se perdre — et c'est le bon sens de la perte : on ne recalcule
 * jamais l'étiquette depuis sa propre déduction.
 *
 * Un seul arrondi, en fin de calcul, comme partout ailleurs dans la chaîne.
 */
export function htFromTtc(ttcCents: number, ratePercent: number): number {
  return roundToCents(divideByBasisPoints(fromCents(ttcCents), taxMultiplierBp(ratePercent)));
}

/** Le TTC que ce taux ajoute à un prix HT — tous deux en centimes entiers. */
export function ttcFromHt(htCents: number, ratePercent: number): number {
  return roundToCents(fractionByBasisPoints(fromCents(htCents), taxMultiplierBp(ratePercent)));
}

/**
 * Le prix **hors taxe** d'une déclinaison, quelle que soit son assiette.
 *
 * `null` quand le HT n'est pas dérivable : un prix ancré au TTC sans taux ne
 * peut pas se convertir. Ce n'est pas un cas de repli mais un refus — inventer
 * un taux ferait facturer un montant que personne n'a décidé, et le
 * référentiel a déjà retiré un défaut de ce genre (`DEFAULT_FOOD_VAT_RATE`).
 *
 * Un prix ancré au HT, lui, se rend tel quel : il n'a jamais eu besoin d'un
 * taux pour être ce qu'il est.
 */
export function htPriceOf(
  priceCents: number,
  basis: PriceBasis,
  ratePercent: number | null,
): number | null {
  // On teste `ttc`, pas `ht`, et ce n'est pas un détail de style : une valeur
  // inattendue — une fixture incomplète, une ligne écrite par un script —
  // retombe alors sur le HT, qui est ce que cette colonne a toujours voulu dire
  // et ce que la base pose par défaut. La forme inverse (`if (basis === "ht")`)
  // faisait CONVERTIR tout ce qui n'était pas exactement `"ht"`, donc baisser
  // un prix sur une assiette absente. Un test l'a montré avant la production.
  if (basis === "ttc") {
    return ratePercent === null ? null : htFromTtc(priceCents, ratePercent);
  }
  return priceCents;
}
