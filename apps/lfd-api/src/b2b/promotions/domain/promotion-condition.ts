import { PromotionInvalidConditionError } from "./errors/promotion-errors.js";
import { PromotionInvalidHoursError } from "./errors/promotion-hours-errors.js";
import {
  assertWeeklyHours,
  weeklyHoursAdmit,
  type PromotionMoments,
  type PromotionWeeklyHours,
} from "./promotion-weekly-hours.js";

/**
 * **Les conditions d'une promotion** — une LISTE de conditions typées, toutes
 * doivent tenir ; vide = aucune condition (`documentation/promotions/promotions.md`, § 2.1).
 *
 * Deux variantes bâties : `min_quantity`, la reprise du `minQuantity` d'une
 * règle de prix (jugée sur la quantité de la ligne, et 4ᵉ critère de
 * spécificité) ; `weekly_hours`, les jours et heures
 * (`documentation/promotions/plan-jours-et-heures.md`). Panier minimum,
 * première commande, code promo, limite d'usage sont prévus : chacun sera une
 * variante et son évaluateur, sans toucher aux autres.
 */
export type PromotionCondition =
  { readonly kind: "min_quantity"; readonly value: number } | PromotionWeeklyHours;

export type PromotionConditionKind = PromotionCondition["kind"];

/**
 * @throws {PromotionInvalidConditionError} une quantité minimum mal formée.
 * @throws {PromotionInvalidHoursError} des jours et heures mal posés.
 */
export function assertCondition(condition: PromotionCondition): void {
  switch (condition.kind) {
    case "min_quantity":
      if (!Number.isInteger(condition.value) || condition.value < 1) {
        throw new PromotionInvalidConditionError(condition.kind, condition.value);
      }
      return;
    case "weekly_hours":
      assertWeeklyHours(condition);
      return;
  }
}

/**
 * Chaque condition, puis la liste : une seule condition « jours et heures »
 * — deux se liraient en ET, ce que personne ne pose exprès.
 *
 * @throws les refus de {@link assertCondition}.
 * @throws {PromotionInvalidHoursError} deux conditions « jours et heures ».
 */
export function assertConditions(conditions: readonly PromotionCondition[]): void {
  conditions.forEach(assertCondition);
  if (conditions.filter((condition) => condition.kind === "weekly_hours").length > 1) {
    throw new PromotionInvalidHoursError("repeated");
  }
}

/** La condition « jours et heures », `null` sans elle. */
export function weeklyHoursOf(
  conditions: readonly PromotionCondition[],
): PromotionWeeklyHours | null {
  return conditions.find((condition) => condition.kind === "weekly_hours") ?? null;
}

/**
 * **Les conditions qui ne dépendent pas de l'article** tiennent-elles à ces
 * instants ? Aujourd'hui, les jours et heures ; la quantité se juge par
 * ligne, ailleurs.
 */
export function conditionsAdmitMoments(
  conditions: readonly PromotionCondition[],
  moments: PromotionMoments,
): boolean {
  const hours = weeklyHoursOf(conditions);
  return hours === null || weeklyHoursAdmit(hours, moments);
}
