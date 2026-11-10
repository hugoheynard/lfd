import {
  invoiceBasketDiscountsOf,
  type InvoiceDiscountColumnsRow,
} from "../invoice-basket-discounts.columns.js";

/**
 * Les remises d'un bon relues pour sa facture (plan des promotions, § 18.4 et
 * rectification du 2026-10-31, lot M5) : par le repli unique, et les parts des
 * bons remis quand ils en portent.
 */

const PERCENT = { mode: "percent", bp: 1_000 };

function row(overrides: Partial<InvoiceDiscountColumnsRow> = {}): InvoiceDiscountColumnsRow {
  return {
    discountPromotionId: "p_col",
    discountAdjustment: PERCENT,
    discountLabel: { fr: "Remise colonne", en: "Column", it: "Colonna" },
    discounts: [],
    ...overrides,
  };
}

const D1 = {
  id: "od_1",
  promotionId: "p_1",
  adjustment: PERCENT,
  label: { fr: "Retrait", en: "Pickup", it: "Ritiro" },
  vatShares: [{ rate: 5.5, htCents: 100, vatCents: 6 }],
};
const D2 = {
  id: "od_2",
  promotionId: null,
  adjustment: null,
  label: null,
  vatShares: [{ rate: 20, htCents: 40 }],
};

describe("invoiceBasketDiscountsOf", () => {
  it("lit une commande non reprise dans ses colonnes, comme une remise de rang 1 sans parts", () => {
    expect(invoiceBasketDiscountsOf(row())).toEqual([
      { promotionId: "p_col", label: "Remise colonne", parts: null },
    ]);
  });

  it("ne voit aucune remise sans ajustement figé", () => {
    expect(invoiceBasketDiscountsOf(row({ discountAdjustment: null }))).toEqual([]);
  });

  it("lit la table quand la commande y a des remises, parts de la commande", () => {
    expect(invoiceBasketDiscountsOf(row({ discounts: [D1, D2] }))).toEqual([
      { promotionId: "p_1", label: "Retrait", parts: [{ rate: 5.5, amountCents: 100 }] },
      { promotionId: null, label: null, parts: [{ rate: 20, amountCents: 40 }] },
    ]);
  });

  it("prend les parts des bons remis quand ils en portent, et rien pour une remise absente", () => {
    const notes = [
      { orderDiscountId: "od_1", vatShares: [{ rate: 5.5, htCents: 60 }] },
      { orderDiscountId: "od_1", vatShares: [{ rate: 5.5, htCents: 30 }] },
    ];
    expect(invoiceBasketDiscountsOf(row({ discounts: [D1, D2] }), notes)).toEqual([
      {
        promotionId: "p_1",
        label: "Retrait",
        parts: [
          { rate: 5.5, amountCents: 60 },
          { rate: 5.5, amountCents: 30 },
        ],
      },
      { promotionId: null, label: null, parts: [] },
    ]);
  });

  it("rend des parts nulles quand elles sont illisibles", () => {
    const notes = [{ orderDiscountId: "od_1", vatShares: { broken: true } }];
    expect(invoiceBasketDiscountsOf(row({ discounts: [D1] }), notes)[0]?.parts).toBeNull();
  });
});
