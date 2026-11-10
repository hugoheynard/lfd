import type { CartAdjustment } from "@lfd/contracts";

import { SplitSkuCoverageError } from "../../errors/basket-discount-errors.js";
import {
  coveredLinesOf,
  coveredSkusOf,
  frozenBasketDiscountsOf,
  frozenDiscountAmountsOf,
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

describe("coveredSkusOf — la couverture par SKU est sûre, pas supposée (condition de M7)", () => {
  const lines = [
    { id: "l1", sku: "PAIN" },
    { id: "l2", sku: "JUS" },
    { id: "l3", sku: "PAIN" },
  ];

  it("rend les SKU dont toutes les lignes sont couvertes", () => {
    expect(coveredSkusOf("o_1", lines, ["l1", "l3"])).toEqual(["PAIN"]);
    expect(coveredSkusOf("o_1", lines, [])).toEqual([]);
  });

  it("refuse deux lignes d'un même SKU couvertes différemment, en nommant le SKU", () => {
    expect(() => coveredSkusOf("o_1", lines, ["l1"])).toThrow(SplitSkuCoverageError);
    expect(() => coveredSkusOf("o_1", lines, ["l1"])).toThrow("« PAIN »");
  });
});

describe("frozenDiscountAmountsOf — les montants, par le même repli (plan des promotions, M6)", () => {
  const LABEL = { fr: "Été", en: "Summer", it: "Estate" };
  const COLUMNS = {
    discountCents: 500,
    discountTtcCents: 528,
    discountAdjustment: TEN,
    discountLabel: LABEL,
  };

  it("une commande non reprise se lit dans ses colonnes, comme une remise de rang 1", () => {
    expect(frozenDiscountAmountsOf([], COLUMNS)).toEqual([
      { label: LABEL, adjustment: TEN, amountCents: 500, amountTtcCents: 528 },
    ]);
  });

  it("une commande d'avant l'ajustement figé garde son montant connu", () => {
    expect(frozenDiscountAmountsOf([], { ...COLUMNS, discountAdjustment: null })).toHaveLength(1);
  });

  it("sans remise : rien", () => {
    expect(frozenDiscountAmountsOf([], { ...COLUMNS, discountCents: 0 })).toEqual([]);
  });

  it("la table fait foi dès qu'elle a des lignes actives", () => {
    const active = [
      { label: null, adjustment: FIVE_EUROS, amountCents: 300, amountTtcCents: null },
      { label: LABEL, adjustment: TEN, amountCents: 200, amountTtcCents: null },
    ];
    expect(frozenDiscountAmountsOf(active, COLUMNS)).toBe(active);
  });
});
