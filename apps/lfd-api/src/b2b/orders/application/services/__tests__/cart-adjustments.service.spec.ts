import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type PickupAddressView,
  type CustomerAudience,
  type PickupDiscountAudiences,
  PICKUP_CHOICE_REQUIRED,
  PICKUP_CLOSED_FOR_AUDIENCE,
  pickupOpenTo,
} from "@lfd/contracts";

import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import {
  DeliveryClosedForAudienceError,
  NoDeliveryZoneForPostalCodeError,
  PickupClosedForAudienceError,
  PickupNotConfiguredError,
  PickupNotOfferedToAudienceError,
} from "../../../domain/errors/order-errors.js";
import { PickupChoiceRequiredError } from "../../../domain/errors/pickup-choice-errors.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
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

/**
 * Les points en base. `list` filtre par clientèle comme le `where` de
 * l'adaptateur ; `resolve` rend le point quelle que soit sa clientèle.
 */
class Points extends PickupAddressRepository {
  private readonly points: readonly PickupAddressView[];
  constructor(...points: readonly PickupAddressView[]) {
    super();
    this.points = points;
  }
  list(audience: CustomerAudience | null): Promise<readonly PickupAddressView[]> {
    return Promise.resolve(
      this.points.filter((p) => audience === null || pickupOpenTo(p, audience)),
    );
  }
  resolve(id: string): Promise<PickupAddressView | null> {
    return Promise.resolve(this.points.find((p) => p.id === id) ?? null);
  }
}

/** Un point unique : l'existant de toutes les suites d'avant le 2026-10-15. */
class OnePoint extends Points {
  constructor(resolved: PickupAddressView) {
    super(resolved);
  }
}

/** Le point préféré des sociétés — par société, lu seulement pour un retrait sans choix. */
class Preferences extends PreferredPickupReader {
  readonly asked: string[] = [];
  constructor(private readonly byCompany: Readonly<Record<string, string>> = {}) {
    super();
  }
  preferredPickupOf(companyId: string): Promise<string | null> {
    this.asked.push(companyId);
    return Promise.resolve(this.byCompany[companyId] ?? null);
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

class Settings extends DeliveryAvailabilityReader {
  constructor(private readonly view: DeliveryAvailabilityView) {
    super();
  }
  current(): Promise<DeliveryAvailabilityView> {
    return Promise.resolve(this.view);
  }
}

const OPEN = new Settings(DEFAULT_DELIVERY_AVAILABILITY);

describe("CartAdjustments — la remise du point, par clientèle", () => {
  it("applique une remise réservée aux pros à une société active", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: false })),
      new OneZone(),
      OPEN,
      new Preferences(),
    );

    const resolved = await adjustments.forPickup("pickup_1", 5_000, "b2b", null);

    expect(resolved.discountCents).toBe(500);
    expect(resolved.discountAdjustment).toEqual({ mode: "percent", bp: 1_000 });
  });

  /** Ce qui est figé sur la commande : rien, comme pour un point sans remise. */
  it("ne remise pas un particulier quand la remise est réservée aux pros", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: false })),
      new OneZone(),
      OPEN,
      new Preferences(),
    );

    const resolved = await adjustments.forPickup("pickup_1", 5_000, "b2c", null);

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
      new Preferences(),
    );

    expect((await adjustments.forPickup(null, 5_000, "b2b", null)).discountCents).toBe(0);
  });
});

/** Hugo, 2026-10-15 : un site peut être réservé au retrait d'une clientèle. */
describe("CartAdjustments — le retrait, par clientèle du site", () => {
  function reserved(
    pickupAudiences: PickupDiscountAudiences,
    ...others: readonly PickupAddressView[]
  ): CartAdjustments {
    return new CartAdjustments(
      new Points({ ...point({ b2b: true, b2c: true }), pickupAudiences }, ...others),
      new OneZone(),
      OPEN,
      new Preferences(),
    );
  }

  /** Un autre site, ouvert aux deux : le geste « un autre point » existe. */
  const ELSEWHERE: PickupAddressView = { ...point({ b2b: true, b2c: true }), id: "pickup_2" };

  it("refuse un pro sur un site réservé aux particuliers, en nommant le site et le geste", async () => {
    const refusal = reserved({ b2b: false, b2c: true }, ELSEWHERE).forPickup(
      "pickup_1",
      5_000,
      "b2b",
      null,
    );

    await expect(refusal).rejects.toBeInstanceOf(PickupClosedForAudienceError);
    await expect(refusal).rejects.toMatchObject({ code: PICKUP_CLOSED_FOR_AUDIENCE });
    await expect(refusal).rejects.toThrow(
      /« Labo ».*aux professionnels.*Choisissez un autre point/u,
    );
  });

  /**
   * 2026-10-16 : sans aucun site ouvert à la clientèle, « choisissez un autre
   * point » envoyait chercher un point qui n'existe pas.
   */
  it("dit que le retrait n'est pas proposé quand aucun autre site n'est ouvert", async () => {
    const refusal = reserved({ b2b: false, b2c: true }).forPickup("pickup_1", 5_000, "b2b", null);

    await expect(refusal).rejects.toMatchObject({
      code: PICKUP_CLOSED_FOR_AUDIENCE,
      othersOpen: false,
    });
    await expect(refusal).rejects.toThrow(
      /Le retrait n'est pas proposé aux professionnels.*« Labo ».*Choisissez la livraison.*Réglages › Sites/u,
    );
  });

  it("refuse un particulier sur un site réservé aux pros", async () => {
    await expect(
      reserved({ b2b: true, b2c: false }).forPickup("pickup_1", 5_000, "b2c", null),
    ).rejects.toThrow(/aux particuliers/u);
  });

  it("sert la clientèle à qui le site est ouvert", async () => {
    const resolved = await reserved({ b2b: true, b2c: false }).forPickup(
      "pickup_1",
      5_000,
      "b2b",
      null,
    );
    expect(resolved.point.id).toBe("pickup_1");
  });

  it("un site d'avant les cases (vue sans le champ) reste ouvert aux deux", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: true })),
      new OneZone(),
      OPEN,
      new Preferences(),
    );
    await expect(adjustments.forPickup(null, 5_000, "b2b", null)).resolves.toBeDefined();
    await expect(adjustments.forPickup(null, 5_000, "b2c", null)).resolves.toBeDefined();
  });
});

/**
 * Hugo, 2026-10-15 : le « site par défaut » a disparu. Un retrait SANS point
 * choisi suit la règle de la boutique (`preselectedPickupId`) — le préféré
 * s'il est ouvert, sinon le seul ouvert, sinon un refus qui demande de choisir.
 */
describe("CartAdjustments — un retrait sans point choisi", () => {
  const LABO = { ...point({ b2b: true, b2c: true }), id: "pickup_labo", label: "Labo" };
  const VILLAGE = { ...point({ b2b: true, b2c: true }), id: "pickup_village", label: "Village" };
  const PROS_ONLY = { ...VILLAGE, pickupAudiences: { b2b: true, b2c: false } };

  function adjustments(points: Points, preferences = new Preferences()): CartAdjustments {
    return new CartAdjustments(points, new OneZone(), OPEN, preferences);
  }

  it("retient le point préféré de la société quand il lui est ouvert", async () => {
    const preferences = new Preferences({ co_1: "pickup_village" });
    const resolved = await adjustments(new Points(LABO, VILLAGE), preferences).forPickup(
      null,
      5_000,
      "b2b",
      "co_1",
    );
    expect(resolved.point.id).toBe("pickup_village");
    expect(preferences.asked).toEqual(["co_1"]);
  });

  it("retient le seul point ouvert à la clientèle, sans préférence", async () => {
    const resolved = await adjustments(new Points(LABO, PROS_ONLY)).forPickup(
      null,
      5_000,
      "b2c",
      null,
    );
    expect(resolved.point.id).toBe("pickup_labo");
  });

  it("ignore un point préféré fermé à la clientèle, et retombe sur le seul ouvert", async () => {
    const preferences = new Preferences({ co_1: "pickup_village" });
    const resolved = await adjustments(new Points(LABO, PROS_ONLY), preferences).forPickup(
      null,
      5_000,
      "b2c",
      "co_1",
    );
    expect(resolved.point.id).toBe("pickup_labo");
  });

  it("refuse de choisir à la place du client quand plusieurs points sont ouverts", async () => {
    const refusal = adjustments(new Points(LABO, VILLAGE)).forPickup(null, 5_000, "b2b", null);

    await expect(refusal).rejects.toBeInstanceOf(PickupChoiceRequiredError);
    await expect(refusal).rejects.toMatchObject({ code: PICKUP_CHOICE_REQUIRED });
    await expect(refusal).rejects.toThrow(/2 points de retrait.*choisissez/u);
  });

  it("refuse comme « non configuré » quand aucun point n'est ouvert à la clientèle", async () => {
    await expect(
      adjustments(new Points(PROS_ONLY)).forPickup(null, 5_000, "b2c", null),
    ).rejects.toBeInstanceOf(PickupNotConfiguredError);
  });

  it("nomme la clientèle et la sortie quand aucun point ne lui est ouvert", async () => {
    const refusal = adjustments(new Points(PROS_ONLY)).forPickup(null, 5_000, "b2c", null);

    await expect(refusal).rejects.toBeInstanceOf(PickupNotOfferedToAudienceError);
    await expect(refusal).rejects.toMatchObject({ code: "orders.pickup.not_configured" });
    await expect(refusal).rejects.toThrow(
      /Le retrait n'est pas proposé aux particuliers.*Choisissez la livraison/u,
    );
  });

  it("ne lit pas la préférence d'un visiteur ni quand un point est choisi", async () => {
    const preferences = new Preferences();
    const subject = adjustments(new Points(LABO, VILLAGE), preferences);
    await subject.forPickup("pickup_village", 5_000, "b2b", "co_1");
    await subject.forPickup(null, 5_000, "b2c", null).catch(() => undefined);
    expect(preferences.asked).toEqual([]);
  });
});

describe("CartAdjustments — la livraison, par clientèle", () => {
  it("chiffre la livraison ouverte, ligne absente comprise", async () => {
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: true })),
      new OneZone(),
      OPEN,
      new Preferences(),
    );

    const resolved = await adjustments.forDelivery("73150", 5_000, "b2c");

    expect(resolved.feeCents).toBe(2_000);
  });

  it("refuse la livraison fermée à la clientèle, AVANT de chercher la zone", async () => {
    const zones = new OneZone();
    const closedToB2c = new Settings({ ...DEFAULT_DELIVERY_AVAILABILITY, openToB2c: false });
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: true })),
      zones,
      closedToB2c,
      new Preferences(),
    );

    // Même vers un code postal non desservi : la raison du refus est la
    // fermeture, et dire « on ne livre pas là » mentirait.
    await expect(adjustments.forDelivery("99000", 5_000, "b2c")).rejects.toThrow(
      DeliveryClosedForAudienceError,
    );
    expect(zones.lookups).toBe(0);
  });

  it("laisse passer l'autre clientèle quand une seule est fermée", async () => {
    const closedToB2c = new Settings({ ...DEFAULT_DELIVERY_AVAILABILITY, openToB2c: false });
    const adjustments = new CartAdjustments(
      new OnePoint(point({ b2b: true, b2c: true })),
      new OneZone(),
      closedToB2c,
      new Preferences(),
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
