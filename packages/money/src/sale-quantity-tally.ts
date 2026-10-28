import type { SaleQuantity } from "./sale-quantity.js";

/**
 * **Ce qu'une ligne pèse dans un compte cumulé de PIÈCES** — plan
 * `documentation/pricing/vente-au-poids.md`, § 2 : les comptes qui
 * additionnent des pièces de plusieurs articles (le camembert du compte à
 * produire, les pièces annoncées par le dossier du jour, le comptoir de
 * retrait) comptent un article au poids **pour une ligne**, jamais ses
 * grammes.
 *
 * Sans cette règle, 1 250 grammes de saumon pèseraient cent fois les douze
 * croissants de la même commande, et le camembert ne dirait plus rien.
 *
 * ⚠️ Pas pour une somme PAR ARTICLE : un article n'a qu'une unité, ses
 * grammes s'additionnent entre eux (le compte à produire, la réserve du
 * colisage).
 */
export function pieceTally(quantity: SaleQuantity): number {
  if (quantity.unit !== "weight") {
    return quantity.amount;
  }
  // Une ligne au poids réduite à 0 g (un départ incomplet décidé sans elle)
  // ne part pas : elle ne compte pour rien, comme 0 pièce.
  return quantity.amount > 0 ? WEIGHT_LINE_TALLY : 0;
}

/** Une ligne au poids compte pour un, quel que soit son poids. */
const WEIGHT_LINE_TALLY = 1;
