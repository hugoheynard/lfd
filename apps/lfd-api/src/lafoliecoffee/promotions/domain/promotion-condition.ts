import {
  PromotionInvalidMinBasketError,
  PromotionRepeatedMinBasketError,
} from "./errors/promotion-delivery-fee-errors.js";
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
 * Trois variantes bâties : `min_quantity`, la reprise du `minQuantity` d'une
 * règle de prix (jugée sur la quantité de la ligne, et 4ᵉ critère de
 * spécificité) ; `weekly_hours`, les jours et heures
 * (`documentation/promotions/plan-jours-et-heures.md`) ; `min_basket`, le
 * panier minimum d'une promotion « Sur la livraison », en centimes HT, jugé
 * sur la base du franco (`frais-et-livraison-offerte.md`). Première
 * commande, code promo, limite d'usage sont prévus : chacun sera une variante
 * et son évaluateur, sans toucher aux autres.
 */
export type PromotionCondition =
  | { readonly kind: "min_quantity"; readonly value: number }
  | PromotionWeeklyHours
  | PromotionMinBasket;

/**
 * **Le panier minimum** : les marchandises HT après remises, avant le bon —
 * la base du franco. Réservé aux promotions sur la livraison (décision (c)
 * de Hugo, 2026-11-05) : sur une remise, il dépendrait du total qu'elle réduit.
 */
export interface PromotionMinBasket {
  readonly kind: "min_basket";
  readonly cents: number;
}

export type PromotionConditionKind = PromotionCondition["kind"];

/**
 * @throws {PromotionInvalidConditionError} une quantité minimum mal formée.
 * @throws {PromotionInvalidHoursError} des jours et heures mal posés.
 * @throws {PromotionInvalidMinBasketError} un panier minimum mal formé.
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
    case "min_basket":
      if (!Number.isSafeInteger(condition.cents) || condition.cents < 0) {
        throw new PromotionInvalidMinBasketError(condition.cents);
      }
      return;
  }
}

/**
 * Chaque condition, puis la liste : une seule condition « jours et heures »
 * — deux se liraient en ET, ce que personne ne pose exprès.
 *
 * @throws les refus de {@link assertCondition}.
 * @throws {PromotionInvalidHoursError} deux conditions « jours et heures ».
 * @throws {PromotionRepeatedMinBasketError} deux paniers minimum.
 */
export function assertConditions(conditions: readonly PromotionCondition[]): void {
  conditions.forEach(assertCondition);
  if (conditions.filter((condition) => condition.kind === "weekly_hours").length > 1) {
    throw new PromotionInvalidHoursError("repeated");
  }
  if (conditions.filter((condition) => condition.kind === "min_basket").length > 1) {
    throw new PromotionRepeatedMinBasketError();
  }
}

/** Le panier minimum en centimes HT ; `null` sans condition `min_basket`. */
export function minBasketCentsOf(conditions: readonly PromotionCondition[]): number | null {
  const condition = conditions.find((entry) => entry.kind === "min_basket");
  return condition?.cents ?? null;
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
