import type { DiscountLabelView } from "./discount-label.js";

/**
 * **La livraison offerte d'une commande, telle qu'un document la lit** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, § 2.6 et § 2.8) :
 * ce que la livraison aurait coûté, et qui l'a offerte.
 *
 * AFFICHÉE, jamais comptable : le frais facturé de la commande vaut 0, et
 * aucun total, aucune TVA ne dépend de ce montant. Un papier l'écrit en deux
 * lignes qui s'annulent — « Livraison » au barème, puis « Livraison offerte »
 * (ou le libellé de la promotion) au même montant, négatif.
 *
 * Types seuls, sans zod : la boutique la lit, et son budget de démarrage ne
 * paie pas un schéma.
 */
export interface OrderFreeDeliveryView {
  /** Le barème offert, HT, en centimes, positif. */
  readonly waivedCents: number;
  /** Son TTC figé — commande composée en TTC (`exact_ht`) seulement, `null` sinon. */
  readonly waivedTtcCents: number | null;
  /**
   * Le libellé figé de la promotion qui a offert, dans l'audience de
   * l'acheteur. Absent : offerte par le franco de la route — le papier dit
   * « Livraison offerte ».
   */
  readonly label?: DiscountLabelView;
}
