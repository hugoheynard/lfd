import type { DeliveryPricingTerms } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import { audienceTermsOfFact, pricingTermsOfFact } from "./delivery-pricing-fact.js";

/**
 * **Le fait du réglage global de livraison** (plan `plan-livraison-offerte.md`,
 * 0b). Depuis 0b, ce réglage décide du frais que paie toute une clientèle dans
 * chaque zone qui ne le remplace pas : la réclamation qui suit demande « depuis
 * quand, et qui ». Le préfixe `delivery_pricing.` est rangé sous `commandes`
 * dans `activity-module.ts`, avec les zones.
 */
export const DELIVERY_PRICING_FACTS = {
  updated: "delivery_pricing.updated",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet du fait : il n'y a qu'un réglage. */
export const DELIVERY_PRICING_SUBJECT = "delivery_pricing";

/**
 * La charge dit l'état posé ET l'état remplacé : un patch ne touche qu'une
 * valeur, et un frais ne se relit qu'avec l'avant.
 */
export class DeliveryPricingUpdatedEvent implements JournaledEvent {
  constructor(
    readonly terms: DeliveryPricingTerms,
    readonly previous: DeliveryPricingTerms,
  ) {}

  journalFact(): JournalFact {
    return {
      type: DELIVERY_PRICING_FACTS.updated,
      subjectType: "delivery_pricing",
      subjectId: DELIVERY_PRICING_SUBJECT,
      payload: {
        b2b: audienceTermsOfFact(this.terms.b2b),
        b2c: audienceTermsOfFact(this.terms.b2c),
        previous: pricingTermsOfFact(this.previous),
      },
    };
  }
}
