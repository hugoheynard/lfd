import { freeDeliveryOf, type FreeDelivery } from "../value-objects/free-delivery.js";

/**
 * Ce que le jugement du franco lit d'un panier déjà chiffré : le seuil de la
 * route, la base, et le frais que la zone facturerait.
 */
export interface FreeDeliveryJudgementInput {
  /** Le seuil HT de la route ; `null` = pas de franco. */
  readonly thresholdCents: number | null;
  /**
   * **La base du seuil** (Hugo, 2026-11-05) : les marchandises HT, APRÈS les
   * remises (articles et panier), AVANT le bon de fidélité — le bon est un
   * moyen de paiement, il ne fait pas perdre le franco.
   */
  readonly goodsNetHtCents: number;
  /** Le frais que le barème produit, HT. */
  readonly feeHtCents: number;
  /** Le même TTC — commande `exact_ht` seulement, `null` sinon. */
  readonly feeTtcCents: number | null;
}

/**
 * **Le franco est-il atteint ?** (plan `plan-livraison-offerte.md`, 1b) —
 * « dès 80 € » : atteint quand la base vaut le seuil ou plus.
 *
 * Rend `null` sans seuil, sous le seuil, ou quand la livraison ne coûte rien :
 * offrir zéro ne serait pas un cadeau, et la commande resterait identique à
 * ce qu'elle était avant le franco. Fonction pure, appelée par `priceBasket`
 * seul (« une seule arithmétique ») ; l'agrégat en revérifie la forme.
 */
export function judgedFreeDelivery(input: FreeDeliveryJudgementInput): FreeDelivery | null {
  const { thresholdCents } = input;
  if (thresholdCents === null || input.goodsNetHtCents < thresholdCents) {
    return null;
  }
  if (input.feeHtCents === 0 && (input.feeTtcCents ?? 0) === 0) {
    return null;
  }
  return freeDeliveryOf({
    thresholdCents,
    waivedCents: input.feeHtCents,
    waivedTtcCents: input.feeTtcCents,
  });
}
