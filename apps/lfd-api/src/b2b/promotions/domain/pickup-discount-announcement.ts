import type {
  AudiencePickupDiscount,
  CartAdjustment,
  CustomerAudience,
  PickupDiscounts,
} from "@lfd/contracts";

import {
  promotionsAdmitted,
  targetingRankOf,
  type AdmittedPromotion,
  type LivePromotion,
} from "./live-promotion.js";
import type { PromotionEffect } from "./promotion-effect.js";
import { applicationPointOf } from "./promotion-fulfillment.js";
import type { PromotionAudienceFacts } from "./promotion-targeting.js";

/**
 * **Ce que la boutique ANNONCE d'un point de retrait**, tiré des promotions
 * (plan `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 14 B5, lot L8) — pur.
 *
 * Le contrat `PickupAddressView.discounts` porte UNE remise par clientèle
 * (`b2b` = société active, `b2c` = tout le reste : `audienceOf`). Après la
 * bascule, la caisse applique la promotion panier gagnante ; l'annonce doit
 * dire la même, sans que la boutique change. La question est donc posée
 * avec les faits d'un acheteur TYPE de chaque clientèle, au même juge que
 * la caisse (`promotionsAdmitted`, puis le rang du public et de
 * l'acheminement) :
 *
 * - `b2b` : une société active, sans identité (aucun public « société » ne
 *   la vise), porte d'entrée inconnue ;
 * - `b2c` : aucune société, porte d'entrée inconnue.
 *
 * Exact pour les publics qui ne dépendent que de la clientèle — `everyone`,
 * `pros_active`, `everyone_but_active_pros`, ceux de la reprise. `pros` et
 * `individuals` s'annoncent à l'acheteur type, mais un membre d'une société
 * en attente (clientèle `b2c`, servi en pro) reçoit à la caisse la promotion
 * des pros sans qu'on la lui ait annoncée. Un public plus fin (une société,
 * les pros en cours d'inscription, les invités) n'est pas annoncé : le
 * contrat ne sait pas le dire.
 *
 * Le libellé annoncé est celui de la clientèle (L8b, § 15.8) : `b2b` lit le
 * libellé Pros, `b2c` le libellé Particuliers, repli sur le commun — c'est ce
 * que la caisse figera pour l'acheteur type.
 *
 * Une promotion que le contrat ne sait pas porter n'est pas annoncée non plus
 * plutôt que d'être annoncée fausse : une cible déclinaison (le contrat ne
 * connaît que familles et produits), une condition de quantité.
 */

const TYPICAL_BUYER: Readonly<
  Record<CustomerAudience, Omit<PromotionAudienceFacts, "fulfillment">>
> = {
  b2b: {
    companyId: null,
    companyStatus: "active",
    principal: { companyId: null },
    buyerKind: "unknown",
  },
  b2c: {
    companyId: null,
    companyStatus: null,
    principal: { companyId: null },
    buyerKind: "unknown",
  },
};

/** Les deux remises annoncées d'un point, à l'instant `at`. */
export function announcedPickupDiscounts(
  promotions: readonly LivePromotion[],
  pickupId: string,
  at: Date,
): PickupDiscounts {
  return {
    b2b: announcedFor("b2b", promotions, pickupId, at),
    b2c: announcedFor("b2c", promotions, pickupId, at),
  };
}

function announcedFor(
  clientele: CustomerAudience,
  promotions: readonly LivePromotion[],
  pickupId: string,
  at: Date,
): AudiencePickupDiscount | null {
  const facts: PromotionAudienceFacts = {
    ...TYPICAL_BUYER[clientele],
    fulfillment: { method: "pickup", pickupId },
  };
  const basket = promotions.filter(
    (promotion) => applicationPointOf(promotion.fulfillment) === "basket",
  );
  const winner = mostSpecific(promotionsAdmitted(basket, at, facts));
  return winner === null ? null : asPickupDiscount(winner);
}

/**
 * Le rang de la caisse (`chooseBasketPromotion`) : public, acheminement, puis
 * la plus avantageuse (§ 15.6) — sans panier, seulement entre deux effets de
 * même nature (deux taux, deux montants) —, puis l'identifiant. L'écran
 * refuse deux promotions panier qui pourraient s'appliquer ensemble
 * (`BasketPromotionsWouldCombineError`) : il n'en reste qu'une ici, et ce
 * départage ne tranche qu'en théorie.
 */
function mostSpecific(candidates: readonly AdmittedPromotion[]): AdmittedPromotion | null {
  let best: AdmittedPromotion | null = null;
  for (const promotion of candidates) {
    if (best === null || beats(promotion, best)) {
      best = promotion;
    }
  }
  return best;
}

function beats(candidate: AdmittedPromotion, best: AdmittedPromotion): boolean {
  const mine = targetingRankOf(candidate);
  const theirs = targetingRankOf(best);
  const deltas = [
    mine.publicRank - theirs.publicRank,
    mine.fulfillmentRank - theirs.fulfillmentRank,
    advantageDelta(candidate.effect, best.effect),
  ];
  const decisive = deltas.find((delta) => delta !== 0);
  return decisive === undefined ? candidate.id < best.id : decisive > 0;
}

/** Plus avantageux pour le client, entre deux effets de même nature ; `0` sinon. */
function advantageDelta(left: PromotionEffect, right: PromotionEffect): number {
  if (left.kind === "percent_off" && right.kind === "percent_off") {
    return left.basisPoints - right.basisPoints;
  }
  if (left.kind === "basket_amount_off" && right.kind === "basket_amount_off") {
    return left.cents - right.cents;
  }
  return 0;
}

/** La promotion dans la forme du contrat, ou `null` si elle ne s'y exprime pas. */
function asPickupDiscount(promotion: AdmittedPromotion): AudiencePickupDiscount | null {
  const adjustment = adjustmentOf(promotion.effect);
  const rules = promotion.scope.rules;
  if (
    adjustment === null ||
    promotion.conditions.length > 0 ||
    rules.some((rule) => rule.target === "variant")
  ) {
    return null;
  }
  // L'ordre de la fiche d'un site : par cible, pour une lecture stable.
  const sorted = [...rules].sort((left, right) => left.targetId.localeCompare(right.targetId));
  return {
    adjustment,
    label: promotion.servedLabel,
    scope: promotion.scope.mode,
    categories: sorted
      .filter((rule) => rule.target === "category")
      .map((rule) => ({ categoryId: rule.targetId, eligible: rule.eligible })),
    products: sorted
      .filter((rule) => rule.target === "product")
      .map((rule) => ({ productId: rule.targetId, eligible: rule.eligible })),
  };
}

function adjustmentOf(effect: PromotionEffect): CartAdjustment | null {
  switch (effect.kind) {
    case "percent_off":
      return { mode: "percent", bp: effect.basisPoints };
    case "basket_amount_off":
      return { mode: "amount", cents: effect.cents };
    case "unit_amount_off":
    case "fixed_unit_price":
      return null;
  }
}
