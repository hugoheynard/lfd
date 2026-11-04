/**
 * **Le « Total HT » d'un bon de commande de pro** (plan
 * `bons-et-facture-concordants`, F5) — une seule règle pour tout ce qui
 * l'affiche : le bon PDF, le récapitulatif des commandes, la fiche et son
 * pied de montants, le bon en texte et l'e-mail de confirmation. Jusqu'au
 * 2026-11-04, ces quatre derniers lisaient « total − TVA », une seconde
 * formule qui rendait le même chiffre sans le garantir.
 *
 * Articles moins remise et bon de fidélité, jamais sous zéro ; plus livraison
 * et surtaxe — la surtaxe s'ajoute APRÈS la remise.
 */
export interface PretaxGestures {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
}

/** Le HT des articles après remises, plancher à zéro. */
export function netArticlesCents(gestures: PretaxGestures): number {
  return Math.max(
    0,
    gestures.subtotalCents - gestures.discountCents - gestures.voucherDiscountCents,
  );
}

/** Le « Total HT » (ou « Total avant TVA ») que le bon imprime. */
export function orderPretaxCents(gestures: PretaxGestures): number {
  return netArticlesCents(gestures) + gestures.deliveryFeeCents + gestures.lateFeeCents;
}
