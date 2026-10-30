import type { PromotionAudience } from "./promotion-audience.js";
import type { PromotionCondition } from "./promotion-condition.js";
import type { PromotionEffect } from "./promotion-effect.js";
import type { PromotionFulfillment } from "./promotion-fulfillment.js";
import type { PromotionScope } from "./promotion-scope.js";
import {
  audienceAdmits,
  fulfillmentAdmits,
  FULFILLMENT_RANK,
  PUBLIC_RANK,
  type PromotionAudienceFacts,
} from "./promotion-targeting.js";
import type { Promotion } from "./promotion.js";

/**
 * **Une promotion telle que le calcul la lit** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.5, lot L5) — les termes qui agissent sur un prix, et rien du cycle
 * de vie hors de sa pause.
 *
 * Un modèle de LECTURE, sans comportement : l'agrégat garde ses invariants
 * (il a revalidé la ligne au chargement), le calcul ne fait que juger.
 * Matériau de la résolution, il porte sa fenêtre (`lint:dated-decisions`) :
 * une lecture datée doit pouvoir dire qu'elle n'agissait pas encore.
 */
export interface LivePromotion {
  readonly id: string;
  /** Le libellé client — celui de la trace, comme le libellé d'une règle. */
  readonly label: string;
  readonly effect: PromotionEffect;
  readonly stacksOverMercuriale: boolean;
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue** ; `null` = sans fin. */
  readonly validTo: Date | null;
  /** L'instant de la pause, comme `suspendedFrom` d'une règle ; `null` = active. */
  readonly suspendedFrom: Date | null;
  readonly audience: PromotionAudience;
  readonly fulfillment: PromotionFulfillment;
  readonly scope: PromotionScope;
  readonly conditions: readonly PromotionCondition[];
}

/** L'agrégat, réduit à ce que le calcul lit. */
export function livePromotionOf(promotion: Promotion): LivePromotion {
  const state = promotion.toPersistence();
  return {
    id: state.id,
    label: state.label.fr,
    effect: state.effect,
    stacksOverMercuriale: state.stacksOverMercuriale,
    validFrom: state.validFrom,
    validTo: state.validTo,
    suspendedFrom: state.paused?.at ?? null,
    audience: state.audience,
    fulfillment: state.fulfillment,
    scope: state.scope,
    conditions: state.conditions,
  };
}

/**
 * **Ce qui ne dépend pas de l'article** : fenêtre, pause, public,
 * acheminement — jugés une fois pour la question, comme `inForceFor` le fait
 * des règles. Borne basse incluse, haute exclue ; une pause posée avant
 * l'instant l'éteint, une pause posée après ne dit rien de cet instant.
 */
export function promotionsAdmitted(
  promotions: readonly LivePromotion[],
  at: Date,
  facts: PromotionAudienceFacts,
): LivePromotion[] {
  return promotions.filter(
    (promotion) =>
      inWindow(promotion, at) &&
      !(promotion.suspendedFrom !== null && promotion.suspendedFrom.getTime() <= at.getTime()) &&
      audienceAdmits(promotion.audience, facts) &&
      fulfillmentAdmits(promotion.fulfillment, facts.fulfillment),
  );
}

function inWindow(promotion: LivePromotion, at: Date): boolean {
  return (
    promotion.validFrom.getTime() <= at.getTime() &&
    (promotion.validTo === null || promotion.validTo.getTime() > at.getTime())
  );
}

/** Le seuil de quantité d'une promotion, `null` sans condition `min_quantity`. */
export function minQuantityOf(promotion: LivePromotion): number | null {
  const condition = promotion.conditions.find((entry) => entry.kind === "min_quantity");
  return condition?.value ?? null;
}

/** Le rang du public et celui de l'acheminement — en tête de la spécificité. */
export function targetingRankOf(promotion: LivePromotion): {
  readonly publicRank: number;
  readonly fulfillmentRank: number;
} {
  return {
    publicRank: PUBLIC_RANK[promotion.audience.kind],
    fulfillmentRank: FULFILLMENT_RANK[promotion.fulfillment.kind],
  };
}
