import {
  DEFAULT_DELIVERY_SETTINGS,
  type DeliverySettingsView,
  type DeliveryZoneView,
  type PickupAddressView,
  type PickupDiscountAudiences,
} from "@lfd/contracts";

import { DeliverySettingsReader } from "../../../../delivery-settings/domain/ports/delivery-settings.reader.js";
import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import {
  DeliveryClosedForAudienceError,
  NoDeliveryZoneForPostalCodeError,
} from "../../../domain/errors/order-errors.js";
import { CartAdjustments } from "../cart-adjustments.service.js";

function point(audiences: PickupDiscountAudiences): PickupAddressView {
  return {
    id: "pickup_1",
    label: "Labo",
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
    isDefault: true,
    discount: { mode: "percent", bp: 1_000 },
    discountAudiences: audiences,
    opening: { publicOpening: null, proPickup: null },
  };
}

const TARENTAISE: DeliveryZoneView = {
  id: "zone_1",
  label: "Tarentaise",
  postalPrefixes: ["73150"],
  fee: { mode: "amount", cents: 2_000 },
};

class OnePoint extends PickupAddressRepository {
  constructor(private readonly resolved: PickupAddressView) {
    super();
  }
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve([this.resolved]);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(this.resolved);
  }
  create(): Promise<string> {
    return Promise.reject(new Error("non utilisé"));
  }
  update(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
  remove(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
  setDefault(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Les zones, qui comptent leurs lectures : une livraison fermée ne doit pas en coûter. */
class OneZone extends DeliveryZoneRepository {
  lookups = 0;
  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve([TARENTAISE]);
  }
  findById(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(TARENTAISE);
  }
  resolveForPostalCode(codePostal: string): Promise<DeliveryZoneView | null> {
    this.lookups += 1;
    return Promise.resolve(codePostal.startsWith("73150") ? TARENTAISE : null);
  }
  create(): Promise<string> {
    return Promise.reject(new Error("non utilisé"));
  }
  update(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
  remove(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}

class Settings extends DeliverySettingsReader {
  constructor(private readonly view: DeliverySettingsView) {
    super();
  }
  current(): Promise<DeliverySettingsView> {
    return Promise.resolve(this.view);
  }
}

const OPEN = new Settings(DEFAULT_DELIVERY_SETTINGS);

describe("CartAdjustments — la remise du point, par clientèle", () => {
  it("applique une remise réservée aux pros à une société active", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: false })),
      new OneZone(),
      OPEN,
    );

    const resolved = await adjustments.forPickup("pickup_1", 5_000, "b2b");

    expect(resolved.discountCents).toBe(500);
    expect(resolved.discountAdjustment).toEqual({ mode: "percent", bp: 1_000 });
  });

  /** Ce qui est figé sur la commande : rien, comme pour un point sans remise. */
  it("ne remise pas un particulier quand la remise est réservée aux pros", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: false })),
      new OneZone(),
      OPEN,
    );

    const resolved = await adjustments.forPickup("pickup_1", 5_000, "b2c");

    expect(resolved.discountCents).toBe(0);
    expect(resolved.discountAdjustment).toBeNull();
    // Le point reste servi : c'est la remise qui manque, pas le retrait.
    expect(resolved.point.id).toBe("pickup_1");
  });

  it("ne remise pas un pro quand la remise est réservée aux particuliers", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: false, b2c: true })),
      new OneZone(),
      OPEN,
    );

    expect((await adjustments.forPickup(null, 5_000, "b2b")).discountCents).toBe(0);
  });
});

describe("CartAdjustments — la livraison, par clientèle", () => {
  it("chiffre la livraison ouverte, ligne absente comprise", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: true })),
      new OneZone(),
      OPEN,
    );

    const resolved = await adjustments.forDelivery("73150", 5_000, "b2c");

    expect(resolved.feeCents).toBe(2_000);
  });

  it("refuse la livraison fermée à la clientèle, AVANT de chercher la zone", async () => {
    const zones = new OneZone();
    const closedToB2c = new Settings({ ...DEFAULT_DELIVERY_SETTINGS, openToB2c: false });
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: true })),
      zones,
      closedToB2c,
    );

    // Même vers un code postal non desservi : la raison du refus est la
    // fermeture, et dire « on ne livre pas là » mentirait.
    await expect(adjustments.forDelivery("99000", 5_000, "b2c")).rejects.toThrow(
      DeliveryClosedForAudienceError,
    );
    expect(zones.lookups).toBe(0);
  });

  it("laisse passer l'autre clientèle quand une seule est fermée", async () => {
    const closedToB2c = new Settings({ ...DEFAULT_DELIVERY_SETTINGS, openToB2c: false });
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: true })),
      new OneZone(),
      closedToB2c,
    );

    expect((await adjustments.forDelivery("73150", 5_000, "b2b")).feeCents).toBe(2_000);
    await expect(adjustments.forDelivery("99000", 5_000, "b2b")).rejects.toThrow(
      NoDeliveryZoneForPostalCodeError,
    );
  });

  it("porte le code partagé avec la boutique et le message du plan", () => {
    const error = new DeliveryClosedForAudienceError();

    expect(error.code).toBe("orders.delivery.closed_for_audience");
    expect(error.category).toBe("business");
    expect(error.message).toBe(
      "La livraison n'est pas proposée pour cet espace. Choisissez le retrait.",
    );
  });
});
