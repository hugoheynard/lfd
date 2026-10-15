import { htMillicentsOf } from "@lfd/money";
import { proPriceFromPublic } from "@lfd/pim-contracts";

import { SELLABLE_VARIANT, tarte } from "../../../application/__tests__/audience-doubles.js";
import { planProPricePrefill, prefillMismatches } from "../pro-price-prefill.js";

describe("planProPricePrefill — la porte rejouée", () => {
  it.each([
    [199, 5.5, 9_000],
    [455, 20, 8_750],
    [1, 10, 9_333],
    [99_999, 2.1, 10_000],
  ])(
    "pré-remplit %i c TTC à %f %% et %i bp au HT que la chaîne d'origine sert",
    (price, rate, ratioBp) => {
      const [row] = planProPricePrefill(
        [tarte({ variants: [{ ...SELLABLE_VARIANT, priceCents: price }] })],
        new Map([["prd_tarte", { b2b: rate }]]),
        { method: "ratio_ttc", ratioBp },
      );

      const expected = htMillicentsOf(proPriceFromPublic(price, ratioBp), rate);
      expect(row).toMatchObject({
        status: "to_prefill",
        servedHtMillicents: expected,
        prefilledHtMillicents: expected,
        mismatch: false,
      });
    },
  );

  it("ne compte un écart que sur une ligne à pré-remplir", () => {
    const rows = planProPricePrefill(
      [
        tarte({
          variants: [
            { ...SELLABLE_VARIANT, priceCents: 1_000 },
            {
              ...SELLABLE_VARIANT,
              id: "v2",
              sku: "PAT-7-2",
              isDefault: false,
              proPriceMillicents: 1,
            },
          ],
        }),
      ],
      new Map([["prd_tarte", { b2b: 5.5 }]]),
      { method: "entered", ratioBp: 9_000 },
    );

    expect(rows.map((row) => [row.status, row.mismatch])).toEqual([
      ["to_prefill", true],
      ["already_entered", false],
    ]);
    expect(prefillMismatches(rows)).toBe(1);
  });
});
