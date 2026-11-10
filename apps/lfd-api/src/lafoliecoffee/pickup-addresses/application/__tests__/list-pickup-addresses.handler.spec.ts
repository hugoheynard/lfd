import { type PickupAddressView, pickupDiscountFor } from "@lfd/contracts";

import { ListPickupAddressesHandler } from "../list-pickup-addresses.handler.js";
import { ListPickupAddressesQuery } from "../list-pickup-addresses.query.js";
import { FIELDS, FilteringPickups } from "./pickup-address-doubles.js";

const TEN_PERCENT = {
  adjustment: { mode: "percent", bp: 1000 },
  scope: "all_except",
  categories: [],
  products: [],
} as const;

const point = (
  id: string,
  pickupAudiences: { readonly b2b: boolean; readonly b2c: boolean },
  discountAudiences: { readonly b2b: boolean; readonly b2c: boolean },
): PickupAddressView => ({
  ...FIELDS,
  id,
  label: id,
  discounts: {
    b2b: discountAudiences.b2b ? TEN_PERCENT : null,
    b2c: discountAudiences.b2c ? TEN_PERCENT : null,
  },
  pickupAudiences,
  gps: null,
});

const BOTH = { b2b: true, b2c: true };
const PRO_ONLY = { b2b: true, b2c: false };
const PERSO_ONLY = { b2b: false, b2c: true };

const POINTS = [
  point("Labo", BOTH, PRO_ONLY),
  point("Pros", PRO_ONLY, BOTH),
  point("Village", PERSO_ONLY, PERSO_ONLY),
];

describe("ListPickupAddressesHandler — par clientèle", () => {
  it("la clientèle pro : les points ouverts aux pros, et la remise qui leur est due", async () => {
    const pickups = new FilteringPickups(POINTS);

    const listed = await new ListPickupAddressesHandler(pickups).execute(
      new ListPickupAddressesQuery("b2b"),
    );

    expect(pickups.asked).toEqual(["b2b"]);
    expect(listed.map((p) => p.label)).toEqual(["Labo", "Pros"]);
    expect(listed.map((p) => pickupDiscountFor(p, "b2b")?.adjustment ?? null)).toEqual([
      { mode: "percent", bp: 1000 },
      { mode: "percent", bp: 1000 },
    ]);
  });

  it("la clientèle particulier : ses points, et pas la remise réservée aux pros", async () => {
    const pickups = new FilteringPickups(POINTS);

    const listed = await new ListPickupAddressesHandler(pickups).execute(
      new ListPickupAddressesQuery("b2c"),
    );

    expect(pickups.asked).toEqual(["b2c"]);
    expect(listed.map((p) => p.label)).toEqual(["Labo", "Village"]);
    expect(listed.map((p) => pickupDiscountFor(p, "b2c")?.adjustment ?? null)).toEqual([
      null,
      { mode: "percent", bp: 1000 },
    ]);
  });
});
