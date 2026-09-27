import { goodsCents } from "../revenue-scope.js";

describe("goodsCents — CA marchandises HT d'une commande", () => {
  it("retranche la remise du sous-total", () => {
    expect(
      goodsCents({ subtotalCents: 10_000, discountCents: 1_500, voucherDiscountCents: 0 }),
    ).toBe(8_500);
  });

  /**
   * Régression : le bon de fidélité (`voucher_discount_cents`) n'était pas
   * retranché, et le CA marchandises était surestimé dès le premier bon utilisé
   * (fix 2026-09-27).
   */
  it("ne compte pas le montant payé par un bon de fidélité", () => {
    expect(
      goodsCents({ subtotalCents: 10_000, discountCents: 1_500, voucherDiscountCents: 500 }),
    ).toBe(8_000);
  });

  it("ne descend jamais sous zéro", () => {
    expect(
      goodsCents({ subtotalCents: 1_000, discountCents: 600, voucherDiscountCents: 900 }),
    ).toBe(0);
  });
});
