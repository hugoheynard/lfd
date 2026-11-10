import type { DeliveryPricingTerms, DeliveryZonePayload } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { DeliveryPricingUpdatedEvent } from "../delivery-pricing.events.js";
import { DeliveryZoneCreatedEvent, DeliveryZoneUpdatedEvent } from "../delivery-zone.events.js";

/**
 * Les faits du 0b (plan `plan-livraison-offerte.md`) : le réglage global a le
 * sien, et les remplacements d'une zone entrent dans le fait de la zone. Les
 * charges sont éprouvées contre le catalogue STRICT des faits — une clé que le
 * schéma ne connaît pas serait refusée à l'écriture du journal.
 */

const POSED: DeliveryPricingTerms = {
  b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: 5_000 },
  b2c: { fee: { mode: "percent", bp: 500 }, freeDeliveryThresholdCents: null },
};

const NOTHING: DeliveryPricingTerms = {
  b2b: { fee: null, freeDeliveryThresholdCents: null },
  b2c: { fee: null, freeDeliveryThresholdCents: null },
};

const ZONE: DeliveryZonePayload = {
  postalPrefixes: ["73150", "73320"],
  label: "Val d'Isère",
  fee: { mode: "amount", cents: 2_000 },
};

describe("delivery_pricing.updated", () => {
  it("dit l'état posé et l'état remplacé, accepté par le catalogue des faits", () => {
    const fact = new DeliveryPricingUpdatedEvent(POSED, NOTHING).journalFact();

    expect(fact.type).toBe("delivery_pricing.updated");
    expect(fact.payload).toEqual({
      b2b: { fee: { cents: 900 }, freeDeliveryThresholdCents: 5_000 },
      b2c: { fee: { bp: 500 }, freeDeliveryThresholdCents: null },
      previous: {
        b2b: { fee: null, freeDeliveryThresholdCents: null },
        b2c: { fee: null, freeDeliveryThresholdCents: null },
      },
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });
});

describe("delivery_zone.* — les remplacements par audience", () => {
  it("portent les remplacements quand le geste les pose", () => {
    const fact = new DeliveryZoneUpdatedEvent("zone_1", {
      ...ZONE,
      audienceTerms: POSED,
    }).journalFact();

    expect(fact.payload["audienceTerms"]).toEqual({
      b2b: { fee: { cents: 900 }, freeDeliveryThresholdCents: 5_000 },
      b2c: { fee: { bp: 500 }, freeDeliveryThresholdCents: null },
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });

  it("ne les disent pas quand le geste n'y a pas touché", () => {
    const fact = new DeliveryZoneCreatedEvent("zone_1", ZONE).journalFact();

    expect(fact.payload).not.toHaveProperty("audienceTerms");
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });
});
