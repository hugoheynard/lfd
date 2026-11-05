import type { AdminDeliveryZoneView } from "@lfd/contracts";

import { FixedDeliveryPricing, FixedZoneTerms, NO_OVERRIDES } from "./delivery-zone-fee.doubles.js";
import { DeliveryZoneFeeResolver } from "../delivery-zone-fee.resolver.js";

const ZONE: AdminDeliveryZoneView = {
  id: "zone_1",
  label: "Tarentaise",
  postalPrefixes: ["73150"],
  fee: { mode: "amount", cents: 2_000 },
  audienceTerms: {
    ...NO_OVERRIDES,
    b2b: { fee: { mode: "amount", cents: 2_500 }, freeDeliveryThresholdCents: null },
  },
};

const GLOBAL = {
  b2b: { fee: { mode: "amount", cents: 900 }, freeDeliveryThresholdCents: null },
  b2c: { fee: { mode: "amount", cents: 1_500 }, freeDeliveryThresholdCents: null },
} as const;

describe("DeliveryZoneFeeResolver", () => {
  const resolver = new DeliveryZoneFeeResolver(
    new FixedZoneTerms([ZONE]),
    new FixedDeliveryPricing(GLOBAL),
  );

  it("rend la zone publique, sans ses remplacements, et le frais de l'audience", async () => {
    const pros = await resolver.zoneFor("73150", "b2b");
    const individuals = await resolver.zoneFor("73150", "b2c");

    expect(pros?.zone).toEqual({
      id: "zone_1",
      label: "Tarentaise",
      postalPrefixes: ["73150"],
      fee: { mode: "amount", cents: 2_000 },
    });
    expect(pros?.fee).toEqual({ mode: "amount", cents: 2_500 });
    expect(individuals?.fee).toEqual({ mode: "amount", cents: 1_500 });
  });

  it("aucune zone ne couvre le code postal : null", async () => {
    await expect(resolver.zoneFor("75002", "b2c")).resolves.toBeNull();
  });
});
