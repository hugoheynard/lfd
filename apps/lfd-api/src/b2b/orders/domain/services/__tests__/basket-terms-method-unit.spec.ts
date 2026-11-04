import type { DeliveryVatMode } from "@lfd/contracts";

import type { OrderVatMethod } from "../../value-objects/order-vat-method.js";
import { basketTermsOf, type BasketDeliveryFee, type BasketDiscount } from "../basket-terms.js";

/**
 * `basketTermsOf` rend la remise et le port **dans l'unité de la méthode** —
 * plan `documentation/pricing/obsolete/plan-centime-particuliers.md`
 * (§ 5, lot C2) : HT tels que la caisse les rend pour `line_ht`, TTC par la
 * composition de l'agrégat pour `exact_ht`.
 *
 * Déménagée d'`order-composition-draft-of.spec.ts` avec la règle qu'elle
 * tient (`OrderComposition.draftOf` → `basketTermsOf`, lot L1a de
 * `le-prix-d-un-panier.md`) : mêmes cas, mêmes montants.
 */
const LINE = {
  sku: "BAN-001",
  productName: "Banana bread",
  unitPriceMillicents: 1_990_521,
  vatRate: 5.5,
  saleUnit: "piece" as const,
  quantity: 1,
};

// Ce que la caisse rend : 10 % du HT de ligne arrondi.
const DISCOUNT: BasketDiscount = {
  discountCents: 199,
  discountAdjustment: { mode: "percent", bp: 1_000 },
  discountLabel: null,
  discountPromotionId: null,
  ineligibleSkus: new Set(),
  basketDiscounts: undefined,
  discountTerms: null,
};

const NO_FEE: BasketDeliveryFee = { cents: 0, adjustment: null };

function termsOf(
  vatMethod: OrderVatMethod,
  over: {
    readonly discount?: Partial<BasketDiscount>;
    readonly deliveryFee?: BasketDeliveryFee;
    readonly deliveryVatMode?: DeliveryVatMode;
  } = {},
) {
  return basketTermsOf({
    lines: [LINE],
    known: new Map(),
    discount: { ...DISCOUNT, ...over.discount },
    deliveryFee: over.deliveryFee ?? NO_FEE,
    deliveryVatMode: over.deliveryVatMode ?? "standard",
    vatMethod,
  });
}

describe("basketTermsOf — l'unité de la méthode", () => {
  it("line_ht : la remise HT de la caisse, telle quelle", () => {
    const terms = termsOf("line_ht");

    expect(terms.discountCents).toBe(199);
    expect(terms.deliveryFeeCents).toBe(0);
  });

  it("exact_ht : la remise sur le TTC — 10 % de 21,00 € = 2,10 €", () => {
    expect(termsOf("exact_ht").discountCents).toBe(210);
  });

  it("exact_ht : le port converti au mode de TVA du panier", () => {
    const fee = { cents: 1_000, adjustment: { mode: "amount" as const, cents: 1_000 } };
    const noDiscount = { discountCents: 0, discountAdjustment: null };

    const standard = termsOf("exact_ht", { discount: noDiscount, deliveryFee: fee });
    const follows = termsOf("exact_ht", {
      discount: noDiscount,
      deliveryFee: fee,
      deliveryVatMode: "follows_goods",
    });

    expect(standard.deliveryFeeCents).toBe(1_200);
    expect(follows.deliveryFeeCents).toBe(1_055);
    expect(standard.discountCents).toBe(0);
  });

  it("porte l'identifiant de la promotion panier que la commande fige (L9)", () => {
    const terms = termsOf("line_ht", { discount: { discountPromotionId: "promo_1" } });

    expect(terms.discountPromotionId).toBe("promo_1");
  });
});
