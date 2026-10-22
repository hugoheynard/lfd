import {
  type AudiencePickupDiscount,
  DEFAULT_DELIVERY_AVAILABILITY,
  type DeliveryAvailabilityView,
  type DeliveryZoneView,
  type PickupAddressView,
} from "@lfd/contracts";

import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeliveryZoneRepository } from "../../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../../pickup-addresses/domain/pickup-address.repository.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { PreferredPickupReader } from "../../../domain/ports/preferred-pickup.reader.js";
import { CartAdjustments } from "../cart-adjustments.service.js";

/**
 * La remise du point sur ses seules lignes éligibles (plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`,
 * R1, Q1, Q2, et le mode de portée décidé par Hugo le 2026-10-22).
 */
const TEN_PERCENT: AudiencePickupDiscount = {
  adjustment: { mode: "percent", bp: 1_000 },
  scope: "all_except",
  categories: [],
  products: [],
};

const PAIN = { sku: "PAI-001", htCents: 1_000 };
const JUS = { sku: "BOI-001", htCents: 1_000 };
const BASKET = [PAIN, JUS];

const CATALOGUE = {
  "PAI-001": { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"] },
  "BOI-001": { productId: "p_jus", categoryId: "c_jus", categoryPath: ["c_jus", "c_boissons"] },
};

class OnePoint extends PickupAddressRepository {
  constructor(private readonly point: PickupAddressView) {
    super();
  }
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve([this.point]);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(this.point);
  }
}

class NoZones extends DeliveryZoneRepository {
  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  resolveForPostalCode(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  create(): Promise<string> {
    return Promise.resolve("zone");
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

class Open extends DeliveryAvailabilityReader {
  current(): Promise<DeliveryAvailabilityView> {
    return Promise.resolve(DEFAULT_DELIVERY_AVAILABILITY);
  }
}

class NoPreference extends PreferredPickupReader {
  preferredPickupOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

function adjustments(
  b2b: AudiencePickupDiscount | null,
  classifications = new FixedLineClassifications(CATALOGUE),
): CartAdjustments {
  const point: PickupAddressView = {
    id: "pickup_1",
    label: "Labo",
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
    discounts: { b2b, b2c: null },
    opening: { publicOpening: null, proPickup: null },
  };
  return new CartAdjustments(
    new OnePoint(point),
    new NoZones(),
    new Open(),
    new NoPreference(),
    classifications,
  );
}

describe("CartAdjustments — l'assiette de la remise de retrait", () => {
  it("retire une famille exclue de l'assiette, et ses sous-familles", async () => {
    const resolved = await adjustments({
      ...TEN_PERCENT,
      categories: [{ categoryId: "c_boissons", eligible: false }],
    }).forPickup("pickup_1", BASKET, "b2b", null);

    expect(resolved.discountCents).toBe(100);
    expect([...resolved.ineligibleSkus]).toEqual(["BOI-001"]);
    expect(resolved.discountAdjustment).toEqual({ mode: "percent", bp: 1_000 });
  });

  it("réinclut un produit dans une famille exclue (Q1)", async () => {
    const resolved = await adjustments({
      ...TEN_PERCENT,
      categories: [{ categoryId: "c_boissons", eligible: false }],
      products: [{ productId: "p_jus", eligible: true }],
    }).forPickup("pickup_1", BASKET, "b2b", null);

    expect(resolved.discountCents).toBe(200);
    expect(resolved.ineligibleSkus.size).toBe(0);
  });

  it("en « seulement », ne remise que ce qui est inclus", async () => {
    const resolved = await adjustments({
      ...TEN_PERCENT,
      scope: "only",
      categories: [{ categoryId: "c_pains", eligible: true }],
    }).forPickup("pickup_1", BASKET, "b2b", null);

    expect(resolved.discountCents).toBe(100);
    expect([...resolved.ineligibleSkus]).toEqual(["BOI-001"]);
  });

  it("borne un montant fixe à l'assiette éligible", async () => {
    const resolved = await adjustments({
      adjustment: { mode: "amount", cents: 5_000 },
      scope: "all_except",
      categories: [{ categoryId: "c_boissons", eligible: false }],
      products: [],
    }).forPickup("pickup_1", BASKET, "b2b", null);

    expect(resolved.discountCents).toBe(1_000);
  });

  /** Le budget du devis : une remise sans règle n'a rien à demander au catalogue. */
  it("ne lit pas le catalogue pour une remise sans règle", async () => {
    const classifications = new FixedLineClassifications(CATALOGUE);

    const resolved = await adjustments(TEN_PERCENT, classifications).forPickup(
      "pickup_1",
      BASKET,
      "b2b",
      null,
    );

    expect(resolved.discountCents).toBe(200);
    expect(classifications.asked).toEqual([]);
  });

  it("se sert du rangement que la passation a déjà lu", async () => {
    const classifications = new FixedLineClassifications(CATALOGUE);
    const known = new Map([["BOI-001", CATALOGUE["BOI-001"]]]);

    const resolved = await adjustments(
      { ...TEN_PERCENT, products: [{ productId: "p_jus", eligible: false }] },
      classifications,
    ).forPickup("pickup_1", BASKET, "b2b", null, known);

    expect([...resolved.ineligibleSkus]).toEqual(["BOI-001"]);
    expect(classifications.asked).toEqual([]);
  });

  it("n'exclut rien sans remise pour la clientèle", async () => {
    const resolved = await adjustments(null).forPickup("pickup_1", BASKET, "b2b", null);

    expect(resolved.discountCents).toBe(0);
    expect(resolved.ineligibleSkus.size).toBe(0);
  });
});
