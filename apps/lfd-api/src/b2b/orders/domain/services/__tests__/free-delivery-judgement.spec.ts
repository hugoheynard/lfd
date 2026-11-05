import {
  freeDeliveryProgressOf,
  judgedFreeDelivery,
  remainingTtcCentsOf,
} from "../free-delivery-judgement.js";

/**
 * Le jugement du franco (plan `plan-livraison-offerte.md`, 1b) : « dès le
 * seuil », sur la base qu'on lui donne, et jamais un cadeau de zéro.
 */
const FEE = { feeHtCents: 1_200, feeTtcCents: null, goodsNetTtcCents: null } as const;

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
        goodsNetTtcCents: null,
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
        goodsNetTtcCents: null,
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
        {
          thresholdCents: 8_000,
          goodsNetHtCents: 10,
          goodsNetTtcCents: null,
          feeHtCents: 0,
          feeTtcCents: 0,
        },
        null,
      ),
    ).toBeNull();
  });
});

describe("freeDeliveryProgressOf — le manque TTC du particulier (Hugo, 2026-11-05)", () => {
  it("exact_ht sous le seuil : le manque HT ET son TTC « environ »", () => {
    expect(
      freeDeliveryProgressOf(
        {
          thresholdCents: 8_000,
          goodsNetHtCents: 6_000,
          goodsNetTtcCents: 6_330,
          feeHtCents: 1_000,
          feeTtcCents: 1_200,
        },
        null,
      ),
    ).toEqual({ status: "short", remainingCents: 2_000, remainingTtcCents: 2_110 });
  });

  it("line_ht (TTC des marchandises inconnu) : pas de clé TTC", () => {
    expect(
      freeDeliveryProgressOf({ thresholdCents: 8_000, goodsNetHtCents: 6_000, ...FEE }, null),
    ).not.toHaveProperty("remainingTtcCents");
  });

  it("base nulle : pas de taux inventé, pas de clé TTC", () => {
    expect(
      freeDeliveryProgressOf(
        {
          thresholdCents: 8_000,
          goodsNetHtCents: 0,
          goodsNetTtcCents: 0,
          feeHtCents: 1_000,
          feeTtcCents: 1_200,
        },
        null,
      ),
    ).toEqual({ status: "short", remainingCents: 8_000 });
  });
});

describe("remainingTtcCentsOf", () => {
  it("5,5 % : le manque au taux du panier", () => {
    expect(remainingTtcCentsOf(2_000, 10_000, 10_550)).toBe(2_110);
  });

  it("20 % : le manque au taux du panier", () => {
    expect(remainingTtcCentsOf(2_000, 10_000, 12_000)).toBe(2_400);
  });

  it("panier mixte : le rapport moyen des marchandises déjà là", () => {
    // 50 € HT à 5,5 % (52,75 €) + 50 € HT à 20 % (60,00 €) → 112,75 / 100,00.
    expect(remainingTtcCentsOf(2_000, 10_000, 11_275)).toBe(2_255);
  });

  it("arrondit au centime SUPÉRIEUR : jamais un manque annoncé trop petit", () => {
    // 1 × 10 550 / 10 000 = 1,055 → 2.
    expect(remainingTtcCentsOf(1, 10_000, 10_550)).toBe(2);
    // 333 × 1 055 / 1 000 = 351,315 → 352.
    expect(remainingTtcCentsOf(333, 1_000, 1_055)).toBe(352);
  });

  it("exact : pas d'arrondi quand le quotient tombe juste", () => {
    expect(remainingTtcCentsOf(1_000, 1_000, 1_200)).toBe(1_200);
  });

  it("base nulle : null", () => {
    expect(remainingTtcCentsOf(500, 0, 0)).toBeNull();
  });
});
