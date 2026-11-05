import type { CartAdjustment, DeliveryAudienceTerms, DeliveryPricingTerms } from "@lfd/contracts";

/**
 * Un frais tel que le journal le relit : `{ bp }` ou `{ cents }`, la forme
 * du `fee` des faits `delivery_zone.*` (schéma `percentOrAmount`).
 */
export function feeOfFact(fee: CartAdjustment): Record<string, number> {
  return fee.mode === "percent" ? { bp: fee.bp } : { cents: fee.cents };
}

/** Une audience, à un niveau ; `null` = rien de réglé. */
export function audienceTermsOfFact(terms: DeliveryAudienceTerms): Record<string, unknown> {
  return {
    fee: terms.fee === null ? null : feeOfFact(terms.fee),
    freeDeliveryThresholdCents: terms.freeDeliveryThresholdCents,
  };
}

/** Les deux audiences, à un niveau. */
export function pricingTermsOfFact(terms: DeliveryPricingTerms): Record<string, unknown> {
  return { b2b: audienceTermsOfFact(terms.b2b), b2c: audienceTermsOfFact(terms.b2c) };
}
