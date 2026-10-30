import type { PromotionTermsPayload } from "@lfd/contracts";

import { PromotionMissingTargetIdError } from "../domain/errors/promotion-errors.js";
import type { PromotionAudience } from "../domain/promotion-audience.js";
import { PromotionAudienceSet } from "../domain/promotion-audience-set.js";
import type { PromotionEffect } from "../domain/promotion-effect.js";
import type { PromotionFulfillment } from "../domain/promotion-fulfillment.js";
import type { PromotionTerms } from "../domain/promotion-terms.js";

/**
 * **Le corps reçu → les termes du domaine.** Une traduction, sans règle :
 * ce qui peut être refusé l'est par l'agrégat (`assertTerms`), dont le refus
 * nommé remonte tel quel. Une saisie ne pose jamais de rang de cible : seul
 * un rang repris d'une règle de prix en porte un.
 *
 * Le public passe par `PromotionAudienceSet.of`, qui le ramène à sa forme
 * canonique et refuse l'ensemble vide (L8b) : le contrôleur n'en juge pas.
 */
export function promotionTermsOf(payload: PromotionTermsPayload): PromotionTerms {
  return {
    internalName: payload.internalName,
    label: payload.label,
    audienceLabels: payload.audienceLabels,
    reason: payload.reason,
    effect: effectOf(payload.effect),
    ownFloor: payload.ownFloor,
    stacksOverMercuriale: payload.stacksOverMercuriale,
    cumulative: payload.cumulative,
    validFrom: new Date(payload.validFrom),
    validTo: payload.validTo === null ? null : new Date(payload.validTo),
    audiences: PromotionAudienceSet.of(payload.audiences.map(audienceOf)),
    fulfillment: fulfillmentOf(payload.fulfillment),
    scope: {
      mode: payload.scope.mode,
      rules: payload.scope.rules.map((rule) => ({ ...rule, targetRank: null })),
    },
    conditions: payload.conditions,
  };
}

function effectOf(effect: PromotionTermsPayload["effect"]): PromotionEffect {
  switch (effect.kind) {
    case "percent_off":
      return { kind: effect.kind, basisPoints: effect.value };
    case "unit_amount_off":
    case "fixed_unit_price":
      return { kind: effect.kind, millicents: effect.value };
    case "basket_amount_off":
      return { kind: effect.kind, cents: effect.value };
  }
}

function audienceOf(audience: PromotionTermsPayload["audiences"][number]): PromotionAudience {
  switch (audience.kind) {
    case "company":
    case "company_and_sites":
      if (audience.companyId === null) {
        throw new PromotionMissingTargetIdError("company");
      }
      return { kind: audience.kind, companyId: audience.companyId };
    default:
      return { kind: audience.kind };
  }
}

function fulfillmentOf(fulfillment: PromotionTermsPayload["fulfillment"]): PromotionFulfillment {
  if (fulfillment.kind !== "pickup_point") {
    return { kind: fulfillment.kind };
  }
  if (fulfillment.pickupId === null) {
    throw new PromotionMissingTargetIdError("pickup_point");
  }
  return { kind: fulfillment.kind, pickupId: fulfillment.pickupId };
}
