import type { AdminDeliveryZoneView, DeliveryPricingTerms } from "@lfd/contracts";

import { ListDeliveryZonesHandler } from "../list-delivery-zones.handler.js";
import { ListDeliveryZonesQuery } from "../list-delivery-zones.query.js";
import { FixedDeliveryPricing, FixedZoneTerms, NO_OVERRIDES } from "./delivery-zone-fee.doubles.js";

/**
 * La route publique des zones (plan `plan-livraison-offerte.md`, 0c) sert le
 * frais RÉSOLU pour la clientèle déclarée. Régression du 2026-11-05 : elle
 * servait l'ancien frais unique de la zone, et la boutique affichait « 0 € »
 * quand le devis facturait le frais global.
 */

const LEGACY = { mode: "amount", cents: 0 } as const;

const FOLLOWS_GLOBAL: AdminDeliveryZoneView = {
  id: "zone_global",
  label: "Chambéry",
  postalPrefixes: ["730"],
  fee: LEGACY,
  audienceTerms: NO_OVERRIDES,
};

const OVERRIDES_PROS: AdminDeliveryZoneView = {
  id: "zone_loin",
  label: "Val d'Isère",
  postalPrefixes: ["73150"],
  fee: LEGACY,
  audienceTerms: {
    b2b: { fee: { mode: "amount", cents: 2_500 }, freeDeliveryThresholdCents: 20_000 },
    b2c: { fee: null, freeDeliveryThresholdCents: null },
  },
};

const GLOBAL: DeliveryPricingTerms = {
  b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: 5_000 },
  b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: 8_000 },
};

function handler(global: DeliveryPricingTerms = GLOBAL): ListDeliveryZonesHandler {
  return new ListDeliveryZonesHandler(
    new FixedZoneTerms([FOLLOWS_GLOBAL, OVERRIDES_PROS]),
    new FixedDeliveryPricing(global),
  );
}

describe("ListDeliveryZonesHandler", () => {
  it("les pros : le global sur la zone qui le suit, le remplacement sur l'autre", async () => {
    const zones = await handler().execute(new ListDeliveryZonesQuery("b2b"));

    expect(zones.map((zone) => [zone.id, zone.fee, zone.freeDeliveryThresholdCents])).toEqual([
      ["zone_global", { mode: "amount", cents: 900 }, 5_000],
      ["zone_loin", { mode: "amount", cents: 2_500 }, 20_000],
    ]);
    expect(zones.every((zone) => zone.audience === "b2b")).toBe(true);
  });

  it("les particuliers : le global partout, le remplacement des pros ne les touche pas", async () => {
    const zones = await handler().execute(new ListDeliveryZonesQuery("b2c"));

    expect(zones.map((zone) => [zone.id, zone.fee, zone.freeDeliveryThresholdCents])).toEqual([
      ["zone_global", { mode: "amount", cents: 1_500 }, 8_000],
      ["zone_loin", { mode: "amount", cents: 1_500 }, 8_000],
    ]);
  });

  it("rien de réglé : l'ancien frais de la zone, sans livraison offerte", async () => {
    const zones = await handler(NO_OVERRIDES).execute(new ListDeliveryZonesQuery("b2c"));

    expect(zones[0]).toMatchObject({ fee: LEGACY, freeDeliveryThresholdCents: null });
  });

  it("ne sert jamais les remplacements eux-mêmes", async () => {
    const zones = await handler().execute(new ListDeliveryZonesQuery("b2b"));

    expect(zones[1]).not.toHaveProperty("audienceTerms");
  });
});
