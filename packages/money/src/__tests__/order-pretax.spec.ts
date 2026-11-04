import { orderPretaxCents } from "../order-pretax.js";

describe("orderPretaxCents — le HT du bon (F5)", () => {
  it("articles moins remises, plus livraison et surtaxe", () => {
    expect(
      orderPretaxCents({
        subtotalCents: 2_000,
        discountCents: 200,
        voucherDiscountCents: 100,
        deliveryFeeCents: 500,
        lateFeeCents: 300,
      }),
    ).toBe(2_500);
  });

  it("une remise plus grande que les articles s'arrête à zéro ; le port s'ajoute ensuite", () => {
    expect(
      orderPretaxCents({
        subtotalCents: 300,
        discountCents: 500,
        voucherDiscountCents: 0,
        deliveryFeeCents: 400,
        lateFeeCents: 0,
      }),
    ).toBe(400);
  });
});
