import type { OrderDiscountView } from "@lfd/contracts";

import { orderDiscountLinesOf } from "../order-sheet-discount-lines.js";

const SUMMER: OrderDiscountView = {
  label: { fr: "Été", en: "Summer", it: "Estate" },
  adjustment: { mode: "percent", bp: 1_000 },
  amountCents: 1_000,
  amountTtcCents: 1_055,
};
const UNNAMED: OrderDiscountView = {
  adjustment: { mode: "amount", cents: 300 },
  amountCents: 300,
  amountTtcCents: null,
};

describe("orderDiscountLinesOf — le bon de commande, une ligne par remise (plan des promotions, M6)", () => {
  it("sans liste : aucune ligne, le papier garde la ligne d'hier", () => {
    expect(orderDiscountLinesOf({})).toEqual({});
  });

  it("une seule remise : aucune ligne, le papier d'aujourd'hui au caractère près", () => {
    expect(orderDiscountLinesOf({ discounts: [SUMMER] })).toEqual({});
  });

  it("deux remises : une ligne chacune, dans l'ordre, libellé fr ou repli « Remise »", () => {
    expect(orderDiscountLinesOf({ discounts: [SUMMER, UNNAMED] })).toEqual({
      discountLines: [
        { label: "Été", cents: 1_000, ttcCents: 1_055, labels: SUMMER.label },
        { label: "Remise", cents: 300, ttcCents: null },
      ],
    });
  });
});
