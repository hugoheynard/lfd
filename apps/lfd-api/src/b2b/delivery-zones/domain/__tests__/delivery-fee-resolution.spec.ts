import type { AdminDeliveryZoneView, DeliveryPricingTerms } from "@lfd/contracts";

import { resolvedDeliveryFee, resolvedFreeDeliveryThreshold } from "../delivery-fee-resolution.js";
import { zoneOfPostalCode } from "../zone-of-postal-code.js";

/**
 * La résolution du frais par audience (plan `plan-livraison-offerte.md`, 0b) :
 * zone > global > ancien frais de la zone, chaque audience pour elle-même.
 */

const NOTHING: DeliveryPricingTerms = {
  b2b: { fee: null, freeDeliveryThresholdCents: null },
  b2c: { fee: null, freeDeliveryThresholdCents: null },
};

const LEGACY = { mode: "amount", cents: 2_000 } as const;

const ZONE: AdminDeliveryZoneView = {
  id: "zone_1",
  label: "Tarentaise",
  postalPrefixes: ["731"],
  fee: LEGACY,
  audienceTerms: NOTHING,
};

const GLOBAL: DeliveryPricingTerms = {
  b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: null },
  b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: null },
};

describe("resolvedDeliveryFee", () => {
  /**
   * Régression attendue du 0b : sans aucun réglage global ni remplacement,
   * chaque audience paie EXACTEMENT l'ancien frais de la zone — le 0b ne
   * change aucun prix tant que personne n'a rien saisi.
   */
  it("sans réglage ni remplacement : l'ancien frais de la zone, pour les deux audiences", () => {
    expect(resolvedDeliveryFee("b2b", ZONE, NOTHING)).toEqual(LEGACY);
    expect(resolvedDeliveryFee("b2c", ZONE, NOTHING)).toEqual(LEGACY);
  });

  it("le réglage global de l'audience remplace l'ancien frais", () => {
    expect(resolvedDeliveryFee("b2b", ZONE, GLOBAL)).toEqual({ mode: "amount", cents: 900 });
    expect(resolvedDeliveryFee("b2c", ZONE, GLOBAL)).toEqual({ mode: "amount", cents: 1_500 });
  });

  it("le remplacement de la zone l'emporte sur le global, pour SON audience seule", () => {
    const farther: AdminDeliveryZoneView = {
      ...ZONE,
      audienceTerms: {
        ...NOTHING,
        b2c: { fee: { mode: "percent", bp: 1_000 }, freeDeliveryThresholdCents: null },
      },
    };

    expect(resolvedDeliveryFee("b2c", farther, GLOBAL)).toEqual({ mode: "percent", bp: 1_000 });
    expect(resolvedDeliveryFee("b2b", farther, GLOBAL)).toEqual({ mode: "amount", cents: 900 });
  });

  it("un global posé pour une seule audience laisse l'autre à l'ancien frais", () => {
    const prosOnly: DeliveryPricingTerms = { ...NOTHING, b2b: GLOBAL.b2b };

    expect(resolvedDeliveryFee("b2b", ZONE, prosOnly)).toEqual({ mode: "amount", cents: 900 });
    expect(resolvedDeliveryFee("b2c", ZONE, prosOnly)).toEqual(LEGACY);
  });

  it("un frais réglé à zéro est un frais posé, pas un « rien de réglé »", () => {
    const free: DeliveryPricingTerms = {
      ...NOTHING,
      b2b: { fee: { mode: "amount", cents: 0 }, freeDeliveryThresholdCents: null },
    };

    expect(resolvedDeliveryFee("b2b", ZONE, free)).toEqual({ mode: "amount", cents: 0 });
  });
});

describe("resolvedFreeDeliveryThreshold (1b)", () => {
  const FRANCO: DeliveryPricingTerms = {
    b2b: { fee: null, freeDeliveryThresholdCents: 5_000 },
    b2c: { fee: null, freeDeliveryThresholdCents: 8_000 },
  };

  /** Régression : sans réglage, aucun franco — l'ancien frais n'a jamais eu de seuil. */
  it("sans réglage ni remplacement : pas de franco", () => {
    expect(resolvedFreeDeliveryThreshold("b2b", ZONE, NOTHING)).toBeNull();
    expect(resolvedFreeDeliveryThreshold("b2c", ZONE, NOTHING)).toBeNull();
  });

  it("le réglage global : chaque audience son seuil", () => {
    expect(resolvedFreeDeliveryThreshold("b2b", ZONE, FRANCO)).toBe(5_000);
    expect(resolvedFreeDeliveryThreshold("b2c", ZONE, FRANCO)).toBe(8_000);
  });

  it("la zone remplace le seuil global, pour SON audience seule", () => {
    const farther: AdminDeliveryZoneView = {
      ...ZONE,
      audienceTerms: { ...NOTHING, b2c: { fee: null, freeDeliveryThresholdCents: 12_000 } },
    };

    expect(resolvedFreeDeliveryThreshold("b2c", farther, FRANCO)).toBe(12_000);
    expect(resolvedFreeDeliveryThreshold("b2b", farther, FRANCO)).toBe(5_000);
  });
});

describe("zoneOfPostalCode", () => {
  it("retient le préfixe le plus long, et rien hors de toute zone", () => {
    const precise = { ...ZONE, id: "zone_2", postalPrefixes: ["73150"] };

    expect(zoneOfPostalCode([ZONE, precise], "73150")?.id).toBe("zone_2");
    expect(zoneOfPostalCode([ZONE, precise], "73100")?.id).toBe("zone_1");
    expect(zoneOfPostalCode([ZONE, precise], "75002")).toBeNull();
  });
});
