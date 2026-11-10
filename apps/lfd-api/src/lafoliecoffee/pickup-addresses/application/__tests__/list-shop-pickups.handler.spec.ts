import type { AudiencePickupDiscount, PickupAddressView } from "@lfd/contracts";

import { ListShopPickupsHandler } from "../list-shop-pickups.handler.js";
import { ListShopPickupsQuery } from "../list-shop-pickups.query.js";
import { FIELDS, FilteringPickups } from "./pickup-address-doubles.js";

const percent = (bp: number): AudiencePickupDiscount => ({
  adjustment: { mode: "percent", bp },
  scope: "all_except",
  categories: [],
  products: [],
});

const PRO = percent(1500);
const PENDING = percent(1200);
const INDIVIDUAL = percent(500);

const point = (id: string, pickupAudiences: { b2b: boolean; b2c: boolean }): PickupAddressView => ({
  ...FIELDS,
  id,
  label: id,
  discounts: { b2b: PRO, b2bPending: PENDING, b2c: INDIVIDUAL },
  pickupAudiences,
  gps: null,
});

const POINTS = [
  point("Labo", { b2b: true, b2c: true }),
  point("Pros", { b2b: true, b2c: false }),
  point("Village", { b2b: false, b2c: true }),
];

const SHOP_KEYS = [
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
];

describe("ListShopPickupsHandler — une seule part par appel", () => {
  /**
   * Régression : un visiteur recevait les remises des trois clientèles
   * (`b2b`, `b2bPending`, `b2c`) sur chaque point (corrigé le 2026-10-31).
   */
  it("un visiteur ne reçoit plus la remise des autres clientèles", async () => {
    const pickups = new FilteringPickups(POINTS);

    const listed = await new ListShopPickupsHandler(pickups).execute(
      new ListShopPickupsQuery("visitor"),
    );

    expect(pickups.asked).toEqual(["b2c"]);
    expect(listed.map((p) => p.label)).toEqual(["Labo", "Village"]);
    expect(listed.map((p) => p.discount)).toEqual([INDIVIDUAL, INDIVIDUAL]);
    for (const served of listed) {
      expect(Object.keys(served).sort()).toEqual(SHOP_KEYS);
    }
    expect(JSON.stringify(listed)).not.toMatch(/"(b2b|b2bPending|b2c|discounts|pickupAudiences)"/u);
  });

  it("la vitrine pro : les points des pros, et la remise d'une société active seule", async () => {
    const pickups = new FilteringPickups(POINTS);

    const listed = await new ListShopPickupsHandler(pickups).execute(
      new ListShopPickupsQuery("pro"),
    );

    expect(pickups.asked).toEqual(["b2b"]);
    expect(listed.map((p) => p.label)).toEqual(["Labo", "Pros"]);
    expect(listed.map((p) => p.discount)).toEqual([PRO, PRO]);
    expect(JSON.stringify(listed)).not.toMatch(/"(b2b|b2bPending|b2c|discounts|pickupAudiences)"/u);
  });
});
