import type { AudiencePickupDiscount } from "@lfd/contracts";

import type { ShopCartQuoting } from "../shop-cart-quoting.service.js";
import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * Le devis de la boutique dit « remise retrait sur X € éligibles » (lot C du
 * plan `livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 * Le vrai service, et les vrais services qu'il compose, montés sur des ports
 * doublés à la main.
 */
const CATALOG = [
  catalogItem("PAI-001", "Baguette", 100_000, 5.5),
  catalogItem("TAS-001", "Tasse", 1_000_000, 20),
];

const CLASSIFIED = {
  "PAI-001": { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"] },
  "TAS-001": { productId: "p_tasse", categoryId: "c_objets", categoryPath: ["c_objets"] },
};

const MUGS_EXCLUDED: AudiencePickupDiscount = {
  adjustment: { mode: "percent", bp: 1_000 },
  scope: "all_except",
  categories: [{ categoryId: "c_objets", eligible: false }],
  products: [],
};

function quoting(b2c: AudiencePickupDiscount | null): ShopCartQuoting {
  return quotingOf({ catalog: CATALOG, b2c, classified: CLASSIFIED });
}

const PICKUP = { method: "pickup" as const, pickupAddressId: "pickup_1" };
const BASKET = [
  { sku: "PAI-001", quantity: 10 },
  { sku: "TAS-001", quantity: 1 },
];

describe("ShopCartQuoting — l'assiette de la remise de retrait (lot C)", () => {
  it("dit l'assiette éligible, HT et TTC, et nomme la ligne exclue", async () => {
    const { view } = await quoting(MUGS_EXCLUDED).quote({
      payload: { lines: BASKET, fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });

    const bread = view.lines.find((line) => line.sku === "PAI-001");
    expect(view.pickupDiscountBase).toEqual({
      eligibleHtCents: bread?.lineTotalCents,
      eligibleTtcCents: bread?.lineTotalTtcCents,
      excludedSkus: ["TAS-001"],
    });
    // La remise est calculée sur CETTE assiette, et sur elle seule.
    expect(view.discountCents).toBe(Math.round((bread?.lineTotalCents ?? 0) / 10));
  });

  it("n'en dit rien quand la remise couvre tout le panier", async () => {
    const { view } = await quoting({ ...MUGS_EXCLUDED, categories: [] }).quote({
      payload: { lines: BASKET, fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });

    expect(view.discountCents).toBeGreaterThan(0);
    expect(view).not.toHaveProperty("pickupDiscountBase");
  });

  it("n'en dit rien sans remise de retrait", async () => {
    const { view } = await quoting(null).quote({
      payload: { lines: BASKET, fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });

    expect(view.discountCents).toBe(0);
    expect(view).not.toHaveProperty("pickupDiscountBase");
  });
});
