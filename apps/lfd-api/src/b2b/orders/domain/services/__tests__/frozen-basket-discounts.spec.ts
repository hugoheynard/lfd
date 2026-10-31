import type { CartAdjustment } from "@lfd/contracts";

import {
  coveredLinesOf,
  frozenBasketDiscountsOf,
  type FrozenBasketDiscount,
} from "../frozen-basket-discounts.js";
import { tableDiscount } from "./frozen-basket-discounts.fixture.js";

const TEN: CartAdjustment = { mode: "percent", bp: 1_000 };
const FIVE_EUROS: CartAdjustment = { mode: "amount", cents: 500 };

describe("frozenBasketDiscountsOf — la table, sinon les colonnes (plan des promotions, M4)", () => {
  /**
   * Régression de conception (rectification du 2026-10-31) : un lecteur qui
   * lit `order_discounts` seule voit ZÉRO remise sur une commande non
   * reprise, et lui recompose un bon sans la sienne.
   */
  it("une commande non reprise garde sa remise : les colonnes, comme une remise de rang 1", () => {
    expect(
      frozenBasketDiscountsOf([], { discountPromotionId: "promo_a", discountAdjustment: TEN }),
    ).toEqual([
      {
        orderDiscountId: null,
        promotionId: "promo_a",
        adjustment: TEN,
        label: null,
        coveredSkus: null,
      },
    ]);
  });

  it("la table fait foi dès qu'elle a des lignes actives, les colonnes ne sont pas relues", () => {
    const active = [tableDiscount("od_1", FIVE_EUROS, ["PAIN"]), tableDiscount("od_2", TEN, [])];

    expect(
      frozenBasketDiscountsOf(active, { discountPromotionId: "autre", discountAdjustment: TEN }),
    ).toBe(active);
  });

  it("sans ligne ni ajustement figé : aucune remise, rien d'inventé", () => {
    expect(
      frozenBasketDiscountsOf([], { discountPromotionId: null, discountAdjustment: null }),
    ).toEqual([]);
  });
});

describe("coveredLinesOf — ce que couvre une remise, ligne par ligne", () => {
  const lines = [
    { sku: "PAIN", pickupDiscountEligible: true },
    { sku: "JUS", pickupDiscountEligible: false },
    { sku: "PAIN", pickupDiscountEligible: true },
  ];

  it("lue dans les colonnes : les lignes éligibles, comme hier", () => {
    const [column] = frozenBasketDiscountsOf([], {
      discountPromotionId: null,
      discountAdjustment: TEN,
    });
    expect(coveredLinesOf(column as FrozenBasketDiscount, lines)).toEqual([0, 2]);
  });

  it("lue en table : ses SKU, toutes les lignes de chacun, éligibilité d'hier ignorée", () => {
    expect(coveredLinesOf(tableDiscount("od_1", TEN, ["JUS"]), lines)).toEqual([1]);
    expect(coveredLinesOf(tableDiscount("od_2", TEN, ["PAIN"]), lines)).toEqual([0, 2]);
  });
});
