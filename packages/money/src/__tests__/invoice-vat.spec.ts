import { invoiceVatBreakdown } from "../invoice-vat.js";

/**
 * Depuis le 2026-10-22, la facture ne répartit plus rien : remises et frais
 * arrivent découpés par taux (`splitOrderByRate`, éprouvé à part). Ce qui
 * reste à éprouver ici : les catégories, la base imposable, la TVA une fois
 * par taux (BR-S-09), et le refus d'une base négative.
 */
describe("invoiceVatBreakdown", () => {
  it("pose les parts reçues taux par taux, une part par nature, zéros compris", () => {
    const result = invoiceVatBreakdown({
      goods: [
        { htCents: 1000, vatRate: 5.5 },
        { htCents: 3000, vatRate: 20 },
      ],
      allowances: [
        { key: "company", byRate: [{ vatRate: 5.5, amountCents: 100 }] },
        {
          key: "voucher",
          byRate: [
            { vatRate: 5.5, amountCents: 1 },
            { vatRate: 20, amountCents: 2 },
          ],
        },
      ],
      charges: [],
    });

    expect(result.categories.map((c) => c.allowances)).toEqual([
      [
        { key: "company", amountCents: 100 },
        { key: "voucher", amountCents: 1 },
      ],
      [
        { key: "company", amountCents: 0 },
        { key: "voucher", amountCents: 2 },
      ],
    ]);
    // 899 × 5,5 % = 49,445 → 49 ; 2998 × 20 % = 599,6 → 600.
    expect(result.categories.map((c) => [c.taxableBaseCents, c.vatCents])).toEqual([
      [899, 49],
      [2998, 600],
    ]);
    expect(result).toMatchObject({ allowancesCents: 103, vatCents: 649, totalCents: 4546 });
  });

  it("additionne deux parts du même taux d'une même nature", () => {
    const result = invoiceVatBreakdown({
      goods: [{ htCents: 1000, vatRate: 5.5 }],
      allowances: [
        {
          key: "company",
          byRate: [
            { vatRate: 5.5, amountCents: 30 },
            { vatRate: 5.5, amountCents: 20 },
          ],
        },
      ],
      charges: [],
    });

    expect(result.categories[0]?.allowances).toEqual([{ key: "company", amountCents: 50 }]);
  });

  it("une remise égale à la base laisse une base et une TVA nulles", () => {
    const result = invoiceVatBreakdown({
      goods: [{ htCents: 1000, vatRate: 5.5 }],
      allowances: [{ key: "company", byRate: [{ vatRate: 5.5, amountCents: 1000 }] }],
      charges: [],
    });

    expect(result.categories).toEqual([
      {
        rate: 5.5,
        goodsHtCents: 1000,
        allowances: [{ key: "company", amountCents: 1000 }],
        charges: [],
        taxableBaseCents: 0,
        vatCents: 0,
      },
    ]);
    expect(result.totalCents).toBe(0);
  });

  it("sans marchandise, un frais fait seul sa catégorie", () => {
    const result = invoiceVatBreakdown({
      goods: [],
      allowances: [],
      charges: [{ key: "delivery", byRate: [{ vatRate: 20, amountCents: 500 }] }],
    });

    expect(result.categories).toEqual([
      {
        rate: 20,
        goodsHtCents: 0,
        allowances: [],
        charges: [{ key: "delivery", amountCents: 500 }],
        taxableBaseCents: 500,
        vatCents: 100,
      },
    ]);
  });

  it("refuse une remise sur un taux sans marchandise", () => {
    expect(() =>
      invoiceVatBreakdown({
        goods: [{ htCents: 1000, vatRate: 20 }],
        allowances: [{ key: "company", byRate: [{ vatRate: 5.5, amountCents: 10 }] }],
        charges: [],
      }),
    ).toThrow(RangeError);
  });

  it("refuse des remises qui, ensemble, dépassent la marchandise d'un taux", () => {
    expect(() =>
      invoiceVatBreakdown({
        goods: [{ htCents: 100, vatRate: 5.5 }],
        allowances: [
          { key: "company", byRate: [{ vatRate: 5.5, amountCents: 60 }] },
          { key: "voucher", byRate: [{ vatRate: 5.5, amountCents: 41 }] },
        ],
        charges: [],
      }),
    ).toThrow(/dépasse la marchandise/);
  });

  /**
   * BR-S-09 : la TVA se calcule sur la base ARRONDIE.
   * 1000 − 1 = 999 × 5,5 % = 54,945 → 55, une seule fois pour le taux.
   */
  it("calcule la TVA d'un taux une fois, sur la base imposable entière", () => {
    const result = invoiceVatBreakdown({
      goods: [
        { htCents: 500, vatRate: 5.5 },
        { htCents: 500, vatRate: 5.5 },
      ],
      allowances: [{ key: "company", byRate: [{ vatRate: 5.5, amountCents: 1 }] }],
      charges: [{ key: "late_fee", byRate: [{ vatRate: 10, amountCents: 200 }] }],
    });

    expect(result.categories.map((c) => [c.rate, c.taxableBaseCents, c.vatCents])).toEqual([
      [5.5, 999, 55],
      [10, 200, 20],
    ]);
  });
});
