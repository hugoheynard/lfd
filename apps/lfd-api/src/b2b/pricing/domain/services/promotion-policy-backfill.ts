import type { PromotionAudience } from "../../../promotions/domain/promotion-audience.js";
import {
  audienceAdmits,
  type PromotionAudienceFacts,
} from "../../../promotions/domain/promotion-targeting.js";
import {
  NO_PROMOTION_ADMITTED,
  type PromotionAdmission,
} from "../entities/mercuriale-promotion-policy.js";

/**
 * **La reprise des politiques de promotions** — pure
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, § 7 et § 8).
 *
 * Avant, une promotion cochée « aussi pour les tarifs négociés »
 * (`stacks_over_mercuriale`) passait sur tout client sous mercuriale qu'elle
 * visait. Pour que rien ne change sans décision, chaque mercuriale en cours ou
 * à venir — et chaque brouillon — reçoit « Au choix » avec exactement ces
 * promotions-là (non archivées, programmées et en pause comprises) qui visent
 * sa société par leur public ; sinon « Aucune ». Le jugement fin par article
 * n'est pas refait : une promotion choisie qui ne touche aucun de ses
 * articles est sans effet.
 */

/** Une promotion cochée « aussi pour les tarifs négociés », non archivée. */
export interface StackedPromotion {
  readonly id: string;
  readonly internalName: string;
  readonly audiences: readonly PromotionAudience[];
}

/** Une mercuriale (en cours ou à venir) ou un brouillon à régler. */
export interface PolicyBackfillTarget {
  readonly kind: "mercuriale" | "draft";
  /** L'id du document, ou la société pour un brouillon (sa clé). */
  readonly id: string;
  readonly companyId: string;
  readonly label: string;
  /** Sa politique de départ actuelle. */
  readonly current: PromotionAdmission;
  /** Un avenant en porte déjà une : quelqu'un a décidé. */
  readonly decidedByAmendment: boolean;
  /** Les faits de sa société, comme la caisse les lit. */
  readonly facts: PromotionAudienceFacts;
}

/**
 * `set` : à écrire ; `none` : aucune promotion cochée ne la vise, elle reste
 * « Aucune » ; `decided` : déjà réglée (politique ou avenant), la reprise n'y
 * touche pas — c'est ce qui la rend rejouable.
 */
export type PolicyBackfillOutcome = "set" | "none" | "decided";

export interface PolicyBackfillDecision {
  readonly target: PolicyBackfillTarget;
  readonly outcome: PolicyBackfillOutcome;
  readonly policy: PromotionAdmission;
  /** Les promotions retenues, nommées — pour le rapport et le journal. */
  readonly promotions: readonly StackedPromotion[];
}

export function planPolicyBackfill(
  targets: readonly PolicyBackfillTarget[],
  stacked: readonly StackedPromotion[],
): PolicyBackfillDecision[] {
  return targets.map((target) => {
    if (target.current.mode !== "none" || target.decidedByAmendment) {
      return { target, outcome: "decided", policy: target.current, promotions: [] };
    }
    const admitted = stacked
      .filter((promotion) =>
        promotion.audiences.some((audience) => audienceAdmits(audience, target.facts)),
      )
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    if (admitted.length === 0) {
      return { target, outcome: "none", policy: NO_PROMOTION_ADMITTED, promotions: [] };
    }
    return {
      target,
      outcome: "set",
      policy: { mode: "selected", promotionIds: admitted.map((promotion) => promotion.id) },
      promotions: admitted,
    };
  });
}

/** La phrase du rapport, et du journal pour une mercuriale écrite. */
export function describePolicyBackfill(decision: PolicyBackfillDecision): string {
  const { target } = decision;
  const what = `${target.kind === "draft" ? "Brouillon" : "Mercuriale"} « ${target.label} » (${target.companyId})`;
  switch (decision.outcome) {
    case "decided":
      return `${what} — déjà réglée, inchangée`;
    case "none":
      return `${what} — aucune promotion cochée ne la vise : « Aucune promotion »`;
    case "set":
      return `${what} — au choix : ${decision.promotions
        .map((promotion) => `« ${promotion.internalName} »`)
        .join(", ")}`;
  }
}
