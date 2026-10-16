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
        { policy: { method: "ratio_ttc", ratioBp }, ratioBp },
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

  /**
   * Régression (BLOQUANT `vitruve`, lot S) : sous `entered`, une déclinaison
   * sans saisie n'est pas servie ; le contrôle comptait donc un écart sur
   * chaque ligne, et l'`apply` refusait toujours.
   */
  it("sous entered, ne compte aucun écart : la ligne deviendra vendable à ce prix", () => {
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
      { policy: { method: "entered", ratioBp: 9_000 }, ratioBp: 9_000 },
    );

    expect(rows.map((row) => [row.status, row.servedHtMillicents, row.mismatch])).toEqual([
      ["to_prefill", null, false],
      ["already_entered", 1, false],
    ]);
    expect(rows[0]?.prefilledHtMillicents).toBe(853_081);
    expect(prefillMismatches(rows)).toBe(0);
  });

  it("pré-remplit aussi une base sans règles posées, au rapport suggéré", () => {
    const [row] = planProPricePrefill(
      [tarte({ variants: [{ ...SELLABLE_VARIANT, priceCents: 1_000 }] })],
      new Map([["prd_tarte", { b2b: 5.5 }]]),
      { policy: { method: "entered", ratioBp: null }, ratioBp: 9_000 },
    );

    expect(row).toMatchObject({ status: "to_prefill", prefilledHtMillicents: 853_081 });
  });

  /**
   * Lot S (`vitruve`) : une alignée suit le défaut ; si le défaut ne peut pas
   * être pré-rempli, l'aperçu la range sous lui avec la VRAIE cause.
   */
  describe("les alignées, sous leur défaut", () => {
    function aligned(over: { readonly priceCents: number | null }, vat: Record<string, number>) {
      return planProPricePrefill(
        [
          tarte({
            variants: [
              { ...SELLABLE_VARIANT, priceCents: over.priceCents },
              {
                ...SELLABLE_VARIANT,
                id: "v2",
                sku: "PAT-7-2",
                isDefault: false,
                priceCents: over.priceCents,
                pricingFollowsDefault: true,
              },
            ],
          }),
        ],
        new Map([["prd_tarte", vat]]),
        { policy: { method: "entered", ratioBp: 9_000 }, ratioBp: 9_000 },
      )[1];
    }

    it("nomme le taux b2b absent", () => {
      expect(aligned({ priceCents: 1_000 }, {})).toMatchObject({
        status: "aligned",
        followsSku: "PAT-7-1",
        alignedCause: "no_vat_b2b",
      });
    });

    it("nomme le prix public absent", () => {
      expect(aligned({ priceCents: null }, { b2b: 5.5 })).toMatchObject({
        alignedCause: "no_price",
      });
    });

    it("ne nomme rien quand le défaut sera pré-rempli", () => {
      expect(aligned({ priceCents: 1_000 }, { b2b: 5.5 })).toMatchObject({
        followsSku: "PAT-7-1",
        alignedCause: null,
      });
    });
  });

  it("ne range pas sous un défaut une déclinaison à tarif propre", () => {
    const [row] = planProPricePrefill(
      [tarte({ variants: [{ ...SELLABLE_VARIANT, priceCents: 1_000 }] })],
      new Map([["prd_tarte", { b2b: 5.5 }]]),
      { policy: { method: "ratio_ttc", ratioBp: 9_000 }, ratioBp: 9_000 },
    );

    expect(row).toMatchObject({ followsSku: null, alignedCause: null, mismatch: false });
  });
});
