import type { CustomerAudience, PickupAddressView, PickupDiscounts } from "@lfd/contracts";

import { FIELDS } from "../../application/__tests__/pickup-address-doubles.js";
import { PickupAddressRepository } from "../../domain/pickup-address.repository.js";
import { PickupDiscountAnnouncer } from "../../domain/pickup-discount.announcer.js";
import { AnnouncedPickupAddressRepository } from "../announced-pickup-address.repository.js";

const SITE_COLUMNS: PickupDiscounts = {
  b2b: {
    adjustment: { mode: "percent", bp: 1000 },
    scope: "all_except",
    categories: [],
    products: [],
  },
  b2c: null,
};
const FROM_PROMOTIONS: PickupDiscounts = {
  b2b: {
    adjustment: { mode: "percent", bp: 2000 },
    scope: "all_except",
    categories: [],
    products: [],
  },
  b2c: {
    adjustment: { mode: "amount", cents: 300 },
    scope: "all_except",
    categories: [],
    products: [],
  },
};

const point = (id: string): PickupAddressView => ({ ...FIELDS, id, discounts: SITE_COLUMNS });

class TwoPoints extends PickupAddressRepository {
  list(_audience: CustomerAudience | null): Promise<readonly PickupAddressView[]> {
    return Promise.resolve([point("coeur"), point("gare")]);
  }

  resolve(id: string): Promise<PickupAddressView | null> {
    return Promise.resolve(id === "absent" ? null : point(id));
  }
}

class FixedAnnouncer extends PickupDiscountAnnouncer {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly answer: ReadonlyMap<string, PickupDiscounts> | null) {
    super();
  }

  announced(pickupIds: readonly string[]): Promise<ReadonlyMap<string, PickupDiscounts> | null> {
    this.asked.push(pickupIds);
    return Promise.resolve(this.answer);
  }
}

describe("AnnouncedPickupAddressRepository — la remise annoncée suit la source", () => {
  it("avant la bascule, rend les colonnes du site", async () => {
    const repository = new AnnouncedPickupAddressRepository(
      new TwoPoints(),
      new FixedAnnouncer(null),
    );

    const listed = await repository.list(null);

    expect(listed.map((entry) => entry.discounts)).toEqual([SITE_COLUMNS, SITE_COLUMNS]);
  });

  it("après, rend l'annonce des promotions — à la liste comme à la caisse", async () => {
    const announcer = new FixedAnnouncer(new Map([["coeur", FROM_PROMOTIONS]]));
    const repository = new AnnouncedPickupAddressRepository(new TwoPoints(), announcer);

    const listed = await repository.list("b2c");
    const resolved = await repository.resolve("coeur");

    expect(listed[0]?.discounts).toEqual(FROM_PROMOTIONS);
    expect(resolved?.discounts).toEqual(FROM_PROMOTIONS);
    expect(announcer.asked).toEqual([["coeur", "gare"], ["coeur"]]);
  });

  it("un point introuvable reste introuvable, sans rien demander", async () => {
    const announcer = new FixedAnnouncer(new Map());
    const repository = new AnnouncedPickupAddressRepository(new TwoPoints(), announcer);

    await expect(repository.resolve("absent")).resolves.toBeNull();
    expect(announcer.asked).toEqual([]);
  });
});
