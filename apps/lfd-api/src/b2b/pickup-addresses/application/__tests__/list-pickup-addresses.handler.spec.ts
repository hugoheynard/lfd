import {
  type CustomerAudience,
  type PickupAddressView,
  pickupDiscountFor,
  pickupOpenTo,
} from "@lfd/contracts";

import { PickupAddressRepository } from "../../domain/pickup-address.repository.js";
import { ListPickupAddressesHandler } from "../list-pickup-addresses.handler.js";
import { ListPickupAddressesQuery } from "../list-pickup-addresses.query.js";
import { FIELDS } from "./pickup-address-doubles.js";

const point = (
  id: string,
  pickupAudiences: { readonly b2b: boolean; readonly b2c: boolean },
  discountAudiences: { readonly b2b: boolean; readonly b2c: boolean },
): PickupAddressView => ({
  ...FIELDS,
  id,
  label: id,
  discount: { mode: "percent", bp: 1000 },
  discountAudiences,
  pickupAudiences,
  gps: null,
});

const BOTH = { b2b: true, b2c: true };
const PRO_ONLY = { b2b: true, b2c: false };
const PERSO_ONLY = { b2b: false, b2c: true };

/** Le port, filtré comme l'adaptateur le fait en base : par la case de la clientèle. */
class FilteringPickups extends PickupAddressRepository {
  readonly asked: (CustomerAudience | null)[] = [];

  constructor(private readonly points: readonly PickupAddressView[]) {
    super();
  }

  list(audience: CustomerAudience | null): Promise<readonly PickupAddressView[]> {
    this.asked.push(audience);
    return Promise.resolve(
      audience === null ? this.points : this.points.filter((p) => pickupOpenTo(p, audience)),
    );
  }

  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(null);
  }
}

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
    expect(listed.map((p) => pickupDiscountFor(p, "b2b"))).toEqual([
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
    expect(listed.map((p) => pickupDiscountFor(p, "b2c"))).toEqual([
      null,
      { mode: "percent", bp: 1000 },
    ]);
  });
});
