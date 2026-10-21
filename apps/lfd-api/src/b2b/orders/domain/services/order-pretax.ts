/**
 * **Le « Total HT » d'un bon de commande de pro** (plan
 * `bons-et-facture-concordants`, F5) — une seule règle, lue par le bon
 * (`order-sheet-pdf-totals.ts`) et par la liste des bons du récapitulatif
 * (`plan-recapitulatif-des-commandes.md`, §10) : les deux impriment le même
 * HT, et un écart entre eux ne peut pas naître d'une seconde formule.
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
