import {
  PromotionDeliveryFeeForeignOptionError,
  PromotionInvalidMinBasketError,
  PromotionMinBasketOutsideDeliveryFeeError,
  PromotionRepeatedMinBasketError,
} from "../errors/promotion-delivery-fee-errors.js";
import { PromotionEffectPointMismatchError } from "../errors/promotion-errors.js";
import { PromotionEmptyFulfillmentListError } from "../errors/promotion-fulfillment-errors.js";
import { describePromotion } from "../promotion-act.js";
import { effectOf, effectValueOf } from "../promotion-effect.js";
import { canonicalFulfillment, listedZonesOf } from "../promotion-fulfillment.js";
import { fulfillmentRankOf } from "../promotion-targeting.js";
import { assertTerms } from "../promotion-terms.js";
import { Promotion } from "../promotion.js";
import { FROM, basketTerms, deliveryFeeTerms, lineTerms } from "./promotion-terms.fixture.js";

/**
 * **La promotion « Sur la livraison »** (`plan-livraison-offerte.md`, § 2.3,
 * § 2.7) : son point, son effet sans valeur, son panier minimum, et ce
 * qu'elle refuse de porter.
 */
const pose = (terms = deliveryFeeTerms()): Promotion =>
  Promotion.pose("p1", terms, "staff_1", FROM);

describe("Promotion « Sur la livraison » — le point et l'effet", () => {
  it("se pose au point `delivery_fee`, avec l'effet `free_delivery` de valeur 0", () => {
    const promotion = pose();
    expect(promotion.applicationPoint).toBe("delivery_fee");
    expect(effectValueOf({ kind: "free_delivery" })).toBe(0);
    expect(effectOf("free_delivery", 0)).toEqual({ kind: "free_delivery" });
  });

  it("relit une valeur non nulle comme une forme inconnue", () => {
    expect(effectOf("free_delivery", 100)).toBeNull();
  });

  it("refuse `free_delivery` hors de la livraison", () => {
    expect(() => pose(lineTerms({ effect: { kind: "free_delivery" } }))).toThrow(
      PromotionEffectPointMismatchError,
    );
    expect(() => pose(basketTerms({ effect: { kind: "free_delivery" } }))).toThrow(
      PromotionEffectPointMismatchError,
    );
  });

  it("refuse un pourcentage ou un montant sur la livraison", () => {
    expect(() =>
      pose(deliveryFeeTerms({ effect: { kind: "percent_off", basisPoints: 10_000 } })),
    ).toThrow(PromotionEffectPointMismatchError);
    expect(() =>
      pose(deliveryFeeTerms({ effect: { kind: "basket_amount_off", cents: 500 } })),
    ).toThrow(PromotionEffectPointMismatchError);
  });
});

describe("Promotion « Sur la livraison » — ce qu'elle ne porte pas", () => {
  it("refuse une portée sur le catalogue", () => {
    const terms = deliveryFeeTerms({
      scope: {
        mode: "all_except",
        rules: [{ target: "category", targetId: "cat_1", eligible: false, targetRank: null }],
      },
    });
    expect(() => assertTerms(terms)).toThrow(PromotionDeliveryFeeForeignOptionError);
    expect(() =>
      assertTerms(
        deliveryFeeTerms({
          scope: {
            mode: "only",
            rules: [{ target: "category", targetId: "cat_1", eligible: true, targetRank: null }],
          },
        }),
      ),
    ).toThrow(PromotionDeliveryFeeForeignOptionError);
  });

  it("refuse le cumul : deux livraisons offertes n'en font qu'une", () => {
    expect(() => assertTerms(deliveryFeeTerms({ cumulative: true }))).toThrow(
      new PromotionDeliveryFeeForeignOptionError("cumulative"),
    );
  });

  it("refuse une quantité minimum", () => {
    expect(() =>
      assertTerms(deliveryFeeTerms({ conditions: [{ kind: "min_quantity", value: 3 }] })),
    ).toThrow(new PromotionDeliveryFeeForeignOptionError("min_quantity"));
  });

  it("refuse une sélection de zones vide", () => {
    expect(() =>
      assertTerms(
        deliveryFeeTerms({ fulfillment: { kind: "delivery_fee", delivery: { zones: [] } } }),
      ),
    ).toThrow(PromotionEmptyFulfillmentListError);
  });
});

describe("Le panier minimum (`min_basket`)", () => {
  it("s'admet sur la livraison, à 0 comme au-delà", () => {
    expect(() =>
      assertTerms(deliveryFeeTerms({ conditions: [{ kind: "min_basket", cents: 0 }] })),
    ).not.toThrow();
    expect(() =>
      assertTerms(deliveryFeeTerms({ conditions: [{ kind: "min_basket", cents: 5_000 }] })),
    ).not.toThrow();
  });

  it("se refuse sur une remise au panier ou dans le prix affiché", () => {
    const minBasket = [{ kind: "min_basket", cents: 5_000 }] as const;
    expect(() => assertTerms(basketTerms({ conditions: minBasket }))).toThrow(
      PromotionMinBasketOutsideDeliveryFeeError,
    );
    expect(() => assertTerms(lineTerms({ conditions: minBasket }))).toThrow(
      PromotionMinBasketOutsideDeliveryFeeError,
    );
  });

  it.each([-1, 12.5])("refuse un montant qui n'est pas des centimes positifs : %p", (cents) => {
    expect(() =>
      assertTerms(deliveryFeeTerms({ conditions: [{ kind: "min_basket", cents }] })),
    ).toThrow(PromotionInvalidMinBasketError);
  });

  it("refuse deux paniers minimum", () => {
    expect(() =>
      assertTerms(
        deliveryFeeTerms({
          conditions: [
            { kind: "min_basket", cents: 1_000 },
            { kind: "min_basket", cents: 2_000 },
          ],
        }),
      ),
    ).toThrow(PromotionRepeatedMinBasketError);
  });

  it("se dit dans la phrase figée du journal", () => {
    const summary = describePromotion(
      deliveryFeeTerms({ conditions: [{ kind: "min_basket", cents: 5_000 }] }),
    );
    expect(summary).toContain("livraison offerte");
    expect(summary).toContain("sur la livraison");
    expect(summary).toContain("dès 50,00 € HT");
  });
});

describe("L'acheminement « Sur la livraison »", () => {
  it("trie ses zones et les rend comme sélection", () => {
    const fulfillment = { kind: "delivery_fee", delivery: { zones: ["z_b", "z_a"] } } as const;
    expect(canonicalFulfillment(fulfillment)).toEqual({
      kind: "delivery_fee",
      delivery: { zones: ["z_a", "z_b"] },
    });
    expect(listedZonesOf(fulfillment)).toEqual(["z_b", "z_a"]);
  });

  it("n'admet jamais un retrait, et admet sa zone en livraison", () => {
    const listed = { kind: "delivery_fee", delivery: { zones: ["z_a"] } } as const;
    expect(fulfillmentRankOf(listed, { method: "pickup", pickupId: "pk_1" })).toBeNull();
    expect(
      fulfillmentRankOf(
        { kind: "delivery_fee", delivery: "all" },
        { method: "pickup", pickupId: null },
      ),
    ).toBeNull();
    expect(fulfillmentRankOf(listed, { method: "delivery", zoneId: "z_a" })).not.toBeNull();
    expect(fulfillmentRankOf(listed, { method: "delivery", zoneId: "z_b" })).toBeNull();
  });
});
