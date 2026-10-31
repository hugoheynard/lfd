import type { AudiencePickupDiscount, PickupAddressView } from "@lfd/contracts";

import { audiencePickupAddressOf } from "../audience-pickup-address.js";
import { FIELDS } from "./pickup-address-doubles.js";

const percent = (bp: number): AudiencePickupDiscount => ({
  adjustment: { mode: "percent", bp },
  scope: "all_except",
  categories: [],
  products: [],
});

const VIEW: PickupAddressView = {
  ...FIELDS,
  id: "p1",
  discounts: { b2b: percent(1500), b2bPending: percent(1200), b2c: percent(500) },
  pickupAudiences: { b2b: true, b2c: true },
  gps: { lat: 48.85, lng: 2.35 },
};

describe("audiencePickupAddressOf", () => {
  it.each([
    ["b2b", 1500],
    ["b2bPending", 1200],
    ["b2c", 500],
  ] as const)("l'audience %s ne garde que sa remise", (key, bp) => {
    expect(audiencePickupAddressOf(VIEW, key).discount).toEqual(percent(bp));
  });

  it("ne porte aucun champ par clientèle, ni ce que la vue complète ajouterait", () => {
    const served = audiencePickupAddressOf(VIEW, "b2c");

    expect(Object.keys(served).sort()).toEqual([
      "codePostal",
      "discount",
      "gps",
      "id",
      "label",
      "ligne1",
      "ligne2",
      "opening",
      "pays",
      "ville",
    ]);
  });

  it("une remise absente de l'annonce reste absente, jamais celle d'une autre clientèle", () => {
    const withoutPending: PickupAddressView = {
      ...VIEW,
      discounts: { b2b: percent(1500), b2c: null },
    };

    expect(audiencePickupAddressOf(withoutPending, "b2bPending").discount).toBeNull();
    expect(audiencePickupAddressOf({ ...VIEW, gps: undefined }, "b2b").gps).toBeNull();
  });
});
