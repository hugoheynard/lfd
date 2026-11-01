import type { PromotionTerms } from "../../domain/promotion-terms.js";

/**
 * **Les articles dont le prix net aura plus de deux décimales** sous ces
 * termes (`documentation/promotions/plan-remise-par-ligne.md`, § 18.7).
 *
 * Des termes, pas un identifiant : l'avertissement doit parler PENDANT la
 * saisie, avant que la promotion soit posée — c'est là qu'il sert à choisir.
 */
export class GetPromotionDecimalsQuery {
  constructor(readonly terms: PromotionTerms) {}
}
