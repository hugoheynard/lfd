import {
  billedDeliveryFeeOf,
  freeDeliveryOf,
  InvalidFreeDeliveryError,
  type FreeDelivery,
} from "../free-delivery.js";

const FEE = { mode: "amount", cents: 1_500 } as const;

describe("FreeDelivery — le franco figé", () => {
  it("accepte des centimes entiers positifs ou nuls, TTC absent compris", () => {
    expect(
      freeDeliveryOf({
        thresholdCents: 8_000,
        waivedCents: 1_500,
        waivedTtcCents: null,
        promotion: null,
      }),
    ).toEqual({
      thresholdCents: 8_000,
      waivedCents: 1_500,
      waivedTtcCents: null,
      promotion: null,
    });
    expect(
      freeDeliveryOf({ thresholdCents: 0, waivedCents: 0, waivedTtcCents: 0, promotion: null })
        .waivedTtcCents,
    ).toBe(0);
  });

  it.each([
    { thresholdCents: -1, waivedCents: 1_500, waivedTtcCents: null, promotion: null },
    { thresholdCents: 8_000, waivedCents: 12.5, waivedTtcCents: null, promotion: null },
    { thresholdCents: 8_000, waivedCents: 1_500, waivedTtcCents: -3, promotion: null },
  ])("refuse un montant qui n'est pas des centimes positifs : %o", (value) => {
    expect(() => freeDeliveryOf(value)).toThrow(InvalidFreeDeliveryError);
  });

  const LABEL = { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" };

  it("accepte une livraison offerte par une promotion, sans franco de route", () => {
    const value = {
      thresholdCents: null,
      waivedCents: 1_500,
      waivedTtcCents: null,
      promotion: { promotionId: "promo_1", thresholdCents: 0, label: LABEL },
    };
    expect(freeDeliveryOf(value)).toEqual(value);
  });

  it.each([
    ["que personne n'offre", { thresholdCents: null, promotion: null }],
    [
      "par une promotion sans identifiant",
      { promotion: { promotionId: " ", thresholdCents: 0, label: LABEL } },
    ],
    [
      "par une promotion sans libellé",
      { promotion: { promotionId: "p", thresholdCents: 0, label: { ...LABEL, fr: "" } } },
    ],
    [
      "par une promotion au seuil négatif",
      { promotion: { promotionId: "p", thresholdCents: -1, label: LABEL } },
    ],
  ])("refuse une livraison offerte %s", (_case, patch) => {
    const offered: FreeDelivery = {
      thresholdCents: 8_000,
      waivedCents: 1_500,
      waivedTtcCents: null,
      promotion: null,
    };
    expect(() => freeDeliveryOf({ ...offered, ...patch })).toThrow(InvalidFreeDeliveryError);
  });
});

describe("billedDeliveryFeeOf — le barème que la commande facture", () => {
  it("au franco : aucun", () => {
    expect(
      billedDeliveryFeeOf(FEE, {
        thresholdCents: 8_000,
        waivedCents: 1_500,
        waivedTtcCents: null,
        promotion: null,
      }),
    ).toBeNull();
  });

  it("sans franco : le barème figé, tel quel", () => {
    expect(billedDeliveryFeeOf(FEE, null)).toBe(FEE);
    expect(billedDeliveryFeeOf(null, null)).toBeNull();
  });
});
