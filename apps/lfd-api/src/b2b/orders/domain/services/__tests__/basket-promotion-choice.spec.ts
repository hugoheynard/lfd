import type { AudiencePickupDiscount } from "@lfd/contracts";

import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import { chooseBasketPromotion, NO_BASKET_PROMOTION } from "../basket-promotion-choice.js";
import {
  ineligibleSkusOf,
  pickupDiscountCentsOf,
  pickupDiscountScopeOf,
} from "../pickup-discount-eligibility.js";

/**
 * Le point panier (plan des promotions, § 13.2 et § 13.11, lot L5) : une
 * remise de retrait reprise en promotion rend le MÊME montant, la même
 * assiette et le même ajustement que la remise du site.
 */

const CLASSES: ReadonlyMap<string, OrderLineClassification> = new Map([
  [
    "PAI-001",
    { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"], madeToOrder: false },
  ],
  [
    "PAI-002",
    { productId: "p_seigle", categoryId: "c_pains", categoryPath: ["c_pains"], madeToOrder: false },
  ],
  [
    "BOI-001",
    {
      productId: "p_jus",
      categoryId: "c_boissons",
      categoryPath: ["c_boissons"],
      madeToOrder: false,
    },
  ],
]);

const LINES = [
  { sku: "PAI-001", htCents: 1_234, quantity: 3 },
  { sku: "PAI-002", htCents: 877, quantity: 1 },
  { sku: "BOI-001", htCents: 450, quantity: 2 },
];

/** La remise de retrait, et sa reprise telle que la migration l'écrit (§ 13.4). */
function legacyAndReprise(discount: AudiencePickupDiscount): {
  legacy: { cents: number; ineligible: ReadonlySet<string> };
  promotion: LivePromotion;
} {
  const ineligible = ineligibleSkusOf(discount, LINES, CLASSES);
  return {
    legacy: { cents: pickupDiscountCentsOf(discount, LINES, ineligible), ineligible },
    promotion: livePromotion({
      id: "pd_site_b2c",
      effect:
        discount.adjustment.mode === "percent"
          ? { kind: "percent_off", basisPoints: discount.adjustment.bp }
          : { kind: "basket_amount_off", cents: discount.adjustment.cents },
      audience: { kind: "everyone_but_active_pros" },
      fulfillment: { kind: "pickup_point", pickupId: "site" },
      scope: pickupDiscountScopeOf(discount),
    }),
  };
}

function discount(over: Partial<AudiencePickupDiscount>): AudiencePickupDiscount {
  return {
    adjustment: { mode: "percent", bp: 2000 },
    scope: "all_except",
    categories: [],
    products: [],
    ...over,
  };
}

describe("chooseBasketPromotion — la reprise d'une remise de retrait", () => {
  it.each<[string, AudiencePickupDiscount]>([
    ["20 % sur tout", discount({})],
    // Le cas réel de production : tout sauf UNE exception.
    [
      "20 % tout sauf un produit",
      discount({ products: [{ productId: "p_jus", eligible: false }] }),
    ],
    [
      "tout sauf une famille, produit réinclus",
      discount({
        categories: [{ categoryId: "c_pains", eligible: false }],
        products: [{ productId: "p_seigle", eligible: true }],
      }),
    ],
    [
      "seulement une famille",
      discount({ scope: "only", categories: [{ categoryId: "c_boissons", eligible: true }] }),
    ],
    [
      "montant fixe supérieur à l'assiette",
      discount({ adjustment: { mode: "amount", cents: 99_999 } }),
    ],
  ])("%s : même montant, même assiette, même ajustement", (_label, source) => {
    const { legacy, promotion } = legacyAndReprise(source);

    const chosen = chooseBasketPromotion([promotion], LINES, CLASSES);

    expect(chosen.discountCents).toBe(legacy.cents);
    expect([...chosen.ineligibleSkus].sort()).toEqual([...legacy.ineligible].sort());
    expect(chosen.discountAdjustment).toEqual(source.adjustment);
    expect(chosen.promotionId).toBe("pd_site_b2c");
  });

  it("rend l'absence de promotion sans candidate", () => {
    expect(chooseBasketPromotion([], LINES, CLASSES)).toEqual(NO_BASKET_PROMOTION);
  });

  it("préfère le public le plus spécifique, puis la plus avantageuse, puis le plus petit id", () => {
    const everyone = livePromotion({
      id: "a",
      audience: { kind: "everyone" },
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 5000 },
    });
    const pros = livePromotion({
      id: "b",
      audience: { kind: "pros_active" },
      fulfillment: { kind: "pickup" },
    });
    expect(chooseBasketPromotion([everyone, pros], LINES, CLASSES).promotionId).toBe("b");

    const twinLow = livePromotion({ id: "c", fulfillment: { kind: "pickup" } });
    const twinHigh = livePromotion({
      id: "d",
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 3000 },
    });
    expect(chooseBasketPromotion([twinLow, twinHigh], LINES, CLASSES).promotionId).toBe("d");
    const twinSame = livePromotion({ id: "0", fulfillment: { kind: "pickup" } });
    expect(chooseBasketPromotion([twinLow, twinSame], LINES, CLASSES).promotionId).toBe("0");
  });

  it("retire de l'assiette une ligne sous le seuil de quantité", () => {
    const promotion = livePromotion({
      fulfillment: { kind: "pickup" },
      conditions: [{ kind: "min_quantity", value: 2 }],
    });
    const chosen = chooseBasketPromotion([promotion], LINES, CLASSES);
    expect([...chosen.ineligibleSkus]).toEqual(["PAI-002"]);
  });
});
