import {
  orderDiscountsFieldOf,
  type OrderDiscountAmountsSource,
} from "../order-discount-amounts.columns.js";

const LABEL = { fr: "Été", en: "Summer", it: "Estate" };
const TEN = { mode: "percent", bp: 1_000 };

function source(overrides: Partial<OrderDiscountAmountsSource> = {}): OrderDiscountAmountsSource {
  return {
    discountCents: 800,
    discountTtcCents: null,
    discountAdjustment: null,
    discountLabel: "Remises",
    discounts: [],
    ...overrides,
  };
}

describe("orderDiscountsFieldOf — la lecture d'une commande (plan des promotions, M6)", () => {
  it("une commande non reprise : sa remise se dit par les champs d'hier, la clé reste absente", () => {
    expect(orderDiscountsFieldOf(source({ discountAdjustment: TEN }))).toEqual({});
  });

  it("une seule remise dans la table : la clé reste absente", () => {
    const one = { label: LABEL, adjustment: TEN, amountCents: 800, amountTtcCents: null };
    expect(orderDiscountsFieldOf(source({ discounts: [one] }))).toEqual({});
  });

  it("deux remises : une entrée chacune, dans l'ordre ; libellé ou règle illisibles se taisent", () => {
    const field = orderDiscountsFieldOf(
      source({
        discounts: [
          { label: LABEL, adjustment: TEN, amountCents: 500, amountTtcCents: 528 },
          { label: { fr: 1 }, adjustment: { mode: "?" }, amountCents: 300, amountTtcCents: 317 },
        ],
      }),
    );
    expect(field).toEqual({
      discounts: [
        { label: LABEL, adjustment: TEN, amountCents: 500, amountTtcCents: 528 },
        { adjustment: null, amountCents: 300, amountTtcCents: 317 },
      ],
    });
  });
});
