import type { ShopItemView } from "@lfd/contracts";

import { shopCatalogueOf } from "../shop-catalogue-view.js";
import { proportional, servedPricePerKg } from "../shop-catalogue-promoted-per-kg.js";
import { catalogItem } from "./sale-operations-doubles.js";

/**
 * Le kilo suit la pièce sous une PROMOTION, et seulement sous elle
 * (`saisir-un-prix.md`, § 2).
 */

const SALE = {
  operations: [],
  operationOnlySkus: new Set<string>(),
  now: new Date(0),
  audience: "public" as const,
};

function baseItem(): ShopItemView {
  const [item] = shopCatalogueOf([catalogItem("PAI-001")], SALE).items;
  if (item === undefined) {
    throw new TypeError("le rayon de test est vide");
  }
  return item;
}

/** Pièce 0,99 € barrée à 0,79 € TTC, nommée : l'exemple fixé par le plan. */
function promotedPublic(overrides: Partial<ShopItemView> = {}): ShopItemView {
  return {
    ...baseItem(),
    unitPriceTtcCents: 79,
    catalogPriceTtcCents: 99,
    unitPriceMillicents: 74_882,
    catalogPriceMillicents: 93_839,
    promotionNames: ["Petit prix"],
    ...overrides,
  };
}

const ENTERED = { proPricePerKgMillicents: 900_000, publicPricePerKgTtcCents: 990 };

describe("servedPricePerKg — au rayon public", () => {
  it("sous une promotion : 0,99 € barré à 0,79 €, kilo saisi 9,90 € → 7,90 €/kg, 9,90 € barré", () => {
    expect(servedPricePerKg(promotedPublic(), ENTERED, "public")).toEqual({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: 790,
      catalogPricePerKgTtcCents: 990,
    });
  });

  it("barré SANS nom de promotion (mercuriale, palier) : le kilo saisi, rien de barré", () => {
    const { promotionNames, ...unnamed } = promotedPublic();
    void promotionNames;

    expect(servedPricePerKg(unnamed, ENTERED, "public")).toEqual({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: 990,
    });
  });

  it("prix égal au tarif : le kilo saisi, rien de barré", () => {
    expect(servedPricePerKg(baseItem(), ENTERED, "public")).toEqual({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: 990,
    });
  });

  it("prix plus haut que le tarif (rien de barré) : le kilo saisi, sans proportion", () => {
    const higher = { ...baseItem(), unitPriceTtcCents: 500, promotionNames: ["Hausse"] };

    expect(servedPricePerKg(higher, ENTERED, "public")).toEqual({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: 990,
    });
  });

  it("kilo non saisi : rien, barré compris", () => {
    const none = { proPricePerKgMillicents: null, publicPricePerKgTtcCents: null };

    expect(servedPricePerKg(promotedPublic(), none, "public")).toEqual(none);
  });

  it("vendu au poids : aucun kilo servi ni barré, même sous une promotion", () => {
    const byWeight = promotedPublic({ saleUnit: "weight" });

    expect(servedPricePerKg(byWeight, ENTERED, "public")).toEqual({
      proPricePerKgMillicents: null,
      publicPricePerKgTtcCents: null,
    });
  });
});

describe("servedPricePerKg — au rayon pro", () => {
  it("sous une promotion : la proportion HT, en millicentimes, et le saisi barré", () => {
    const item = {
      ...baseItem(),
      unitPriceMillicents: 80_000,
      catalogPriceMillicents: 100_000,
      promotionNames: ["Remise pro"],
    };

    expect(servedPricePerKg(item, ENTERED, "pro")).toEqual({
      proPricePerKgMillicents: 720_000,
      publicPricePerKgTtcCents: null,
      catalogPricePerKgMillicents: 900_000,
    });
  });

  it("sans promotion : le kilo pro saisi, le public absent", () => {
    expect(servedPricePerKg(baseItem(), ENTERED, "pro")).toEqual({
      proPricePerKgMillicents: 900_000,
      publicPricePerKgTtcCents: null,
    });
  });
});

describe("proportional — arrondi une fois, la moitié loin de zéro", () => {
  it("la moitié exacte monte : 1 × 1 ÷ 2 = 0,5 → 1", () => {
    expect(proportional(1, 1, 2)).toBe(1);
  });

  it("sous la moitié descend : 1 × 1 ÷ 3 → 0 ; au-dessus monte : 2 × 1 ÷ 3 → 1", () => {
    expect(proportional(1, 1, 3)).toBe(0);
    expect(proportional(2, 1, 3)).toBe(1);
  });

  it("calcul exact, sans flottant intermédiaire : 9,90 € × 79 ÷ 99 = 7,90 €", () => {
    expect(proportional(990, 79, 99)).toBe(790);
  });
});
