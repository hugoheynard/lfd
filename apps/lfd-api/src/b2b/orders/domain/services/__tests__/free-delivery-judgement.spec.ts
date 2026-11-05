import { freeDeliveryProgressOf, judgedFreeDelivery } from "../free-delivery-judgement.js";

/**
 * Le jugement du franco (plan `plan-livraison-offerte.md`, 1b) : « dès le
 * seuil », sur la base qu'on lui donne, et jamais un cadeau de zéro.
 */
const FEE = { feeHtCents: 1_200, feeTtcCents: null } as const;

describe("judgedFreeDelivery", () => {
  it("atteint pile au seuil : offert, le seuil et le montant retenus", () => {
    expect(judgedFreeDelivery({ thresholdCents: 8_000, goodsNetHtCents: 8_000, ...FEE })).toEqual({
      thresholdCents: 8_000,
      waivedCents: 1_200,
      waivedTtcCents: null,
    });
  });

  it("un centime sous le seuil : pas de franco", () => {
    expect(
      judgedFreeDelivery({ thresholdCents: 8_000, goodsNetHtCents: 7_999, ...FEE }),
    ).toBeNull();
  });

  it("sans seuil : jamais de franco, quelle que soit la base", () => {
    expect(
      judgedFreeDelivery({ thresholdCents: null, goodsNetHtCents: 1_000_000, ...FEE }),
    ).toBeNull();
  });

  it("une livraison qui ne coûte rien n'est pas offerte", () => {
    expect(
      judgedFreeDelivery({
        thresholdCents: 0,
        goodsNetHtCents: 500,
        feeHtCents: 0,
        feeTtcCents: 0,
      }),
    ).toBeNull();
  });

  it("le TTC offert voyage avec le HT quand la méthode en a un", () => {
    expect(
      judgedFreeDelivery({
        thresholdCents: 0,
        goodsNetHtCents: 500,
        feeHtCents: 1_000,
        feeTtcCents: 1_200,
      }),
    ).toEqual({ thresholdCents: 0, waivedCents: 1_000, waivedTtcCents: 1_200 });
  });
});

describe("freeDeliveryProgressOf", () => {
  const input = { thresholdCents: 8_000, ...FEE };

  it("sous le seuil : ce qu'il manque, HT", () => {
    expect(freeDeliveryProgressOf({ ...input, goodsNetHtCents: 6_800 }, null)).toEqual({
      status: "short",
      remainingCents: 1_200,
    });
  });

  it("un centime sous le seuil : il manque un centime", () => {
    expect(freeDeliveryProgressOf({ ...input, goodsNetHtCents: 7_999 }, null)).toEqual({
      status: "short",
      remainingCents: 1,
    });
  });

  it("jugé offert : offert, sans montant", () => {
    const at = { ...input, goodsNetHtCents: 8_000 };
    expect(freeDeliveryProgressOf(at, judgedFreeDelivery(at))).toEqual({ status: "offered" });
  });

  it("sans seuil : rien", () => {
    expect(
      freeDeliveryProgressOf({ ...input, thresholdCents: null, goodsNetHtCents: 10 }, null),
    ).toBeNull();
  });

  it("une livraison qui ne coûte rien : rien à promettre", () => {
    expect(
      freeDeliveryProgressOf(
        { thresholdCents: 8_000, goodsNetHtCents: 10, feeHtCents: 0, feeTtcCents: 0 },
        null,
      ),
    ).toBeNull();
  });
});
