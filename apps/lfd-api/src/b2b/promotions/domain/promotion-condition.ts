import { PromotionInvalidConditionError } from "./errors/promotion-errors.js";

/**
 * **Les conditions d'une promotion** — une LISTE de conditions typées, toutes
 * doivent tenir ; vide = aucune condition (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 12 et § 13.3).
 *
 * Une seule variante est bâtie : `min_quantity`, la reprise du `minQuantity`
 * d'une règle de prix (jugée sur la quantité de la ligne, et 4ᵉ critère de
 * spécificité). Panier minimum, jours et heures, première commande, code
 * promo, limite d'usage sont prévus : chacun sera une variante et son
 * évaluateur, sans toucher aux autres.
 */
export type PromotionCondition = { readonly kind: "min_quantity"; readonly value: number };

export type PromotionConditionKind = PromotionCondition["kind"];

/** @throws {PromotionInvalidConditionError} une condition mal formée. */
export function assertCondition(condition: PromotionCondition): void {
  switch (condition.kind) {
    case "min_quantity":
      if (!Number.isInteger(condition.value) || condition.value < 1) {
        throw new PromotionInvalidConditionError(condition.kind, condition.value);
      }
      return;
  }
}
