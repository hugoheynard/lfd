import { billedDeliveryFeeOf, freeDeliveryOf, InvalidFreeDeliveryError } from "../free-delivery.js";

const FEE = { mode: "amount", cents: 1_500 } as const;

describe("FreeDelivery — le franco figé", () => {
  it("accepte des centimes entiers positifs ou nuls, TTC absent compris", () => {
    expect(
      freeDeliveryOf({ thresholdCents: 8_000, waivedCents: 1_500, waivedTtcCents: null }),
    ).toEqual({
      thresholdCents: 8_000,
      waivedCents: 1_500,
      waivedTtcCents: null,
    });
    expect(
      freeDeliveryOf({ thresholdCents: 0, waivedCents: 0, waivedTtcCents: 0 }).waivedTtcCents,
    ).toBe(0);
  });

  it.each([
    { thresholdCents: -1, waivedCents: 1_500, waivedTtcCents: null },
    { thresholdCents: 8_000, waivedCents: 12.5, waivedTtcCents: null },
    { thresholdCents: 8_000, waivedCents: 1_500, waivedTtcCents: -3 },
  ])("refuse un montant qui n'est pas des centimes positifs : %o", (value) => {
    expect(() => freeDeliveryOf(value)).toThrow(InvalidFreeDeliveryError);
  });
});

describe("billedDeliveryFeeOf — le barème que la commande facture", () => {
  it("au franco : aucun", () => {
    expect(
      billedDeliveryFeeOf(FEE, { thresholdCents: 8_000, waivedCents: 1_500, waivedTtcCents: null }),
    ).toBeNull();
  });

  it("sans franco : le barème figé, tel quel", () => {
    expect(billedDeliveryFeeOf(FEE, null)).toBe(FEE);
    expect(billedDeliveryFeeOf(null, null)).toBeNull();
  });
});
