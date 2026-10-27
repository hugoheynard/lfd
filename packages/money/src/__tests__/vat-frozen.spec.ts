import { ventilateVat } from "../vat.js";

/**
 * 🔴 Le calcul PRO est figé (plan-centime-particuliers, contrainte absolue) :
 * l'arrivée de `composeTtcOrder` ne change pas un centime de `ventilateVat`.
 * Valeurs relevées le 2026-10-27, avant tout branchement.
 */
describe("ventilateVat — figé pour le pro", () => {
  it("rend 21,01 € sur le banana bread, comme avant", () => {
    expect(
      ventilateVat({ lines: [{ htCents: 1991, vatRate: 5.5 }], discountCents: 0, extras: [] }),
    ).toEqual({
      subtotalHtCents: 1991,
      discountCents: 0,
      extrasHtCents: 0,
      vat: [{ rate: 5.5, amountCents: 110 }],
      vatTotalCents: 110,
      totalCents: 2101,
    });
  });

  it("rend 1,49 € sur trois lignes à 0,47 € HT", () => {
    const line = { htCents: 47, vatRate: 5.5 };

    expect(
      ventilateVat({ lines: [line, line, line], discountCents: 0, extras: [] }).totalCents,
    ).toBe(149);
  });

  it("garde ses montants sous remise de retrait et bon", () => {
    expect(
      ventilateVat({
        lines: [
          { htCents: 1991, vatRate: 5.5 },
          { htCents: 583, vatRate: 20, discountEligible: false },
        ],
        eligibleDiscountCents: 150,
        discountCents: 300,
        extras: [],
      }),
    ).toEqual({
      subtotalHtCents: 2574,
      discountCents: 450,
      extrasHtCents: 0,
      vat: [
        { rate: 5.5, amountCents: 89 },
        { rate: 20, amountCents: 102 },
      ],
      vatTotalCents: 191,
      totalCents: 2315,
    });
  });

  it("garde ses montants avec un port qui suit et une surtaxe", () => {
    expect(
      ventilateVat({
        lines: [
          { htCents: 1991, vatRate: 5.5 },
          { htCents: 1167, vatRate: 20 },
        ],
        discountCents: 0,
        extras: [
          { htCents: 500, followsGoods: true },
          { htCents: 200, vatRate: 20 },
        ],
      }),
    ).toEqual({
      subtotalHtCents: 3158,
      discountCents: 0,
      extrasHtCents: 700,
      vat: [
        { rate: 5.5, amountCents: 127 },
        { rate: 20, amountCents: 310 },
      ],
      vatTotalCents: 437,
      totalCents: 4295,
    });
  });
});
