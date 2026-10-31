import type { PromotionAudience } from "./promotion-audience.js";
import {
  servedLabelFor,
  type PromotionAudienceLabels,
  type PromotionLabel,
  type ServedPromotionLabel,
} from "./promotion-labels.js";
import type { PromotionCondition } from "./promotion-condition.js";
import type { PromotionEffect } from "./promotion-effect.js";
import type { PromotionFulfillment } from "./promotion-fulfillment.js";
import type { PromotionScope } from "./promotion-scope.js";
import {
  admittingRankOf,
  fulfillmentAdmits,
  FULFILLMENT_RANK,
  labelAudienceOf,
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
  /** Le libellé commun — le repli de chaque audience (§ 15.4). */
  readonly label: PromotionLabel;
  /** Les libellés Particuliers / Pros ; l'acheteur lit celui de son audience (§ 15.8). */
  readonly audienceLabels: PromotionAudienceLabels;
  readonly effect: PromotionEffect;
  readonly stacksOverMercuriale: boolean;
  /** « Cumulable » (§ 16) — aux deux points depuis M7 (§ 18.6). */
  readonly cumulative: boolean;
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue** ; `null` = sans fin. */
  readonly validTo: Date | null;
  /** L'instant de la pause, comme `suspendedFrom` d'une règle ; `null` = active. */
  readonly suspendedFrom: Date | null;
  /** Les cibles, en forme canonique — au moins une (§ 15.4). */
  readonly audiences: readonly PromotionAudience[];
  readonly fulfillment: PromotionFulfillment;
  readonly scope: PromotionScope;
  readonly conditions: readonly PromotionCondition[];
}

/** L'agrégat, réduit à ce que le calcul lit. */
export function livePromotionOf(promotion: Promotion): LivePromotion {
  const state = promotion.toPersistence();
  return {
    id: state.id,
    label: state.label,
    audienceLabels: state.audienceLabels,
    effect: state.effect,
    stacksOverMercuriale: state.stacksOverMercuriale,
    cumulative: state.cumulative,
    validFrom: state.validFrom,
    validTo: state.validTo,
    suspendedFrom: state.paused?.at ?? null,
    audiences: state.audiences.targets,
    fulfillment: state.fulfillment,
    scope: state.scope,
    conditions: state.conditions,
  };
}

/**
 * **Une promotion admise pour UN acheteur** (§ 15.6, § 15.8, lot L8b) : ce
 * que le public à plusieurs cibles ne dit qu'une fois l'acheteur connu — le
 * rang de la cible qui l'admet, et le libellé de son audience, figé tel
 * quel dans la trace et sur la commande.
 *
 * Un type distinct de {@link LivePromotion} pour qu'une promotion NON jugée
 * ne puisse pas atteindre la chaîne de prix : le rang n'existe qu'admis.
 */
export interface AdmittedPromotion extends LivePromotion {
  /** Le plus haut rang parmi les cibles qui admettent l'acheteur. */
  readonly publicRank: number;
  /** Le libellé de l'audience de l'acheteur, trois langues, repli commun. */
  readonly servedLabel: ServedPromotionLabel;
}

/**
 * **Ce qui ne dépend pas de l'article** : fenêtre, pause, public,
 * acheminement — jugés une fois pour la question, comme `inForceFor` le fait
 * des règles. Borne basse incluse, haute exclue ; une pause posée avant
 * l'instant l'éteint, une pause posée après ne dit rien de cet instant.
 * Le public admet si **au moins une** de ses cibles admet (§ 15.6).
 */
export function promotionsAdmitted(
  promotions: readonly LivePromotion[],
  at: Date,
  facts: PromotionAudienceFacts,
): AdmittedPromotion[] {
  const audience = labelAudienceOf(facts);
  const admitted: AdmittedPromotion[] = [];
  for (const promotion of promotions) {
    const publicRank = admittingRankOf(promotion.audiences, facts);
    if (
      publicRank !== null &&
      inForceAt(promotion, at) &&
      fulfillmentAdmits(promotion.fulfillment, facts.fulfillment)
    ) {
      admitted.push({
        ...promotion,
        publicRank,
        servedLabel: servedLabelFor(promotion.label, promotion.audienceLabels, audience),
      });
    }
  }
  return admitted;
}

/**
 * **En vigueur à cet instant** : dans sa fenêtre (borne basse incluse, haute
 * exclue) et pas en pause — une pause posée avant l'instant l'éteint, une
 * pause posée après ne dit rien de cet instant.
 */
export function inForceAt(promotion: LivePromotion, at: Date): boolean {
  const time = at.getTime();
  return (
    promotion.validFrom.getTime() <= time &&
    (promotion.validTo === null || promotion.validTo.getTime() > time) &&
    !(promotion.suspendedFrom !== null && promotion.suspendedFrom.getTime() <= time)
  );
}

/** Le seuil de quantité d'une promotion, `null` sans condition `min_quantity`. */
export function minQuantityOf(promotion: LivePromotion): number | null {
  const condition = promotion.conditions.find((entry) => entry.kind === "min_quantity");
  return condition?.value ?? null;
}

/**
 * Le rang du public (celui de la cible qui admet l'acheteur) et celui de
 * l'acheminement — en tête de la spécificité.
 */
export function targetingRankOf(promotion: AdmittedPromotion): {
  readonly publicRank: number;
  readonly fulfillmentRank: number;
} {
  return {
    publicRank: promotion.publicRank,
    fulfillmentRank: FULFILLMENT_RANK[promotion.fulfillment.kind],
  };
}
