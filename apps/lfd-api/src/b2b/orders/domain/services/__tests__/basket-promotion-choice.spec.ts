import type { AudiencePickupDiscount } from "@lfd/contracts";

import { admittedPromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { AdmittedPromotion } from "../../../../promotions/domain/live-promotion.js";
import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import { repriseScopeOf } from "../../../../promotions/domain/__tests__/pickup-discount-reprise.fixture.js";
import { chooseBasketPromotion, NO_BASKET_PROMOTION } from "../basket-promotion-choice.js";

/**
 * Le point panier (plan des promotions, § 13.2 et § 13.11, lot L5) : une
 * remise de retrait reprise en promotion rend le MÊME montant, la même
 * assiette et le même ajustement que la remise du site.
 *
 * RÉÉCRIT en L12 (2026-10-30) : l'ancien chemin (`ineligibleSkusOf`,
 * `pickupDiscountCentsOf`) est retiré du code. Les montants et assiettes
 * qu'il rendait sur ce panier sont désormais écrits en clair — les mêmes
 * valeurs, comparées au centime comme avant.
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

/** La reprise d'une remise de retrait en promotion. */
function reprise(discount: AudiencePickupDiscount): AdmittedPromotion {
  return admittedPromotion({
    id: "pd_site_b2c",
    effect:
      discount.adjustment.mode === "percent"
        ? { kind: "percent_off", basisPoints: discount.adjustment.bp }
        : { kind: "basket_amount_off", cents: discount.adjustment.cents },
    audience: { kind: "everyone_but_active_pros" },
    fulfillment: { kind: "pickup_point", pickupId: "site" },
    scope: repriseScopeOf(discount),
  });
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
  // Ce que l'ancien chemin rendait sur `LINES` (assiette 2 561 c en tout).
  it.each<[string, AudiencePickupDiscount, number, readonly string[]]>([
    ["20 % sur tout", discount({}), 512, []],
    // Le cas réel de production : tout sauf UNE exception.
    [
      "20 % tout sauf un produit",
      discount({ products: [{ productId: "p_jus", eligible: false }] }),
      422,
      ["BOI-001"],
    ],
    [
      "tout sauf une famille, produit réinclus",
      discount({
        categories: [{ categoryId: "c_pains", eligible: false }],
        products: [{ productId: "p_seigle", eligible: true }],
      }),
      265,
      ["PAI-001"],
    ],
    [
      "seulement une famille",
      discount({ scope: "only", categories: [{ categoryId: "c_boissons", eligible: true }] }),
      90,
      ["PAI-001", "PAI-002"],
    ],
    [
      "montant fixe supérieur à l'assiette",
      discount({ adjustment: { mode: "amount", cents: 99_999 } }),
      2_561,
      [],
    ],
  ])("%s : même montant, même assiette, même ajustement", (_label, source, cents, ineligible) => {
    const chosen = chooseBasketPromotion([reprise(source)], LINES, CLASSES);

    expect(chosen.discountCents).toBe(cents);
    expect([...chosen.ineligibleSkus].sort()).toEqual([...ineligible]);
    expect(chosen.discountAdjustment).toEqual(source.adjustment);
    expect(chosen.promotionId).toBe("pd_site_b2c");
  });

  it("rend l'absence de promotion sans candidate", () => {
    expect(chooseBasketPromotion([], LINES, CLASSES)).toEqual(NO_BASKET_PROMOTION);
  });

  it("préfère le public le plus spécifique, puis la plus avantageuse, puis le plus petit id", () => {
    const everyone = admittedPromotion({
      id: "a",
      audience: { kind: "everyone" },
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 5000 },
    });
    const pros = admittedPromotion({
      id: "b",
      audience: { kind: "pros_active" },
      fulfillment: { kind: "pickup" },
    });
    expect(chooseBasketPromotion([everyone, pros], LINES, CLASSES).promotionId).toBe("b");

    const twinLow = admittedPromotion({ id: "c", fulfillment: { kind: "pickup" } });
    const twinHigh = admittedPromotion({
      id: "d",
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 3000 },
    });
    expect(chooseBasketPromotion([twinLow, twinHigh], LINES, CLASSES).promotionId).toBe("d");
    const twinSame = admittedPromotion({ id: "0", fulfillment: { kind: "pickup" } });
    expect(chooseBasketPromotion([twinLow, twinSame], LINES, CLASSES).promotionId).toBe("0");
  });

  it("retire de l'assiette une ligne sous le seuil de quantité", () => {
    const promotion = admittedPromotion({
      fulfillment: { kind: "pickup" },
      conditions: [{ kind: "min_quantity", value: 2 }],
    });
    const chosen = chooseBasketPromotion([promotion], LINES, CLASSES);
    expect([...chosen.ineligibleSkus]).toEqual(["PAI-002"]);
  });
});
