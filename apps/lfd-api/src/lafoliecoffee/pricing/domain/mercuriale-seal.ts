import {
  admitsPromotion,
  NO_PROMOTION_ADMITTED,
  type PromotionAdmission,
} from "./entities/mercuriale-promotion-policy.js";
import type { PriceRule } from "./price-rule.js";

/**
 * **Une règle passe-t-elle le scellement de cette mercuriale ?**
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, § 8, bloquant 3)
 *
 * Deux sources, jamais un `false` en dur :
 *
 * - une règle de prix ORDINAIRE qui porte `stacksOverMercuriale` — inchangé ;
 * - une PROMOTION (règle présentée par `promotionAsRule`, qui porte
 *   `promotion`) que la politique datée de la mercuriale scellante accepte :
 *   « Toutes », ou « Au choix » avec son identifiant.
 */
export function passesSeal(rule: PriceRule, sealing: PriceRule): boolean {
  if (rule.stacksOverMercuriale) {
    return true;
  }
  return rule.promotion !== undefined && admitsPromotion(admissionOf(sealing), rule.id);
}

/** Ce que la règle scellante laisse passer ; « Aucune » si elle n'en dit rien. */
export function admissionOf(sealing: PriceRule): PromotionAdmission {
  return sealing.promotionAdmission ?? NO_PROMOTION_ADMITTED;
}
