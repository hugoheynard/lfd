import { invoiceVatBreakdown } from "../invoice-vat.js";

describe("invoiceVatBreakdown", () => {
  /**
   * 333 / 333 / 334 sur 1000, remise de 100 : 33,3 / 33,3 / 33,4 → planchers
   * 33 / 33 / 33, un centime de reste, au plus fort reste (20 %, 0,4).
   * TVA : 300 × 5,5 % = 16,5 → 17 ; 300 × 10 % = 30 ; 300 × 20 % = 60.
   */
  it("répartit une remise aux plus forts restes, sa somme exactement", () => {
    const result = invoiceVatBreakdown({
      goods: [
        { htCents: 333, vatRate: 5.5 },
        { htCents: 333, vatRate: 10 },
        { htCents: 334, vatRate: 20 },
      ],
      allowances: [{ key: "company", amountCents: 100 }],
      charges: [],
    });

    expect(result.categories.map((c) => [c.rate, c.allowances[0]?.amountCents])).toEqual([
      [5.5, 33],
      [10, 33],
      [20, 34],
    ]);
    expect(result.categories.map((c) => [c.taxableBaseCents, c.vatCents])).toEqual([
      [300, 17],
      [300, 30],
      [300, 60],
    ]);
    expect(result).toMatchObject({
      goodsHtCents: 1000,
      allowancesCents: 100,
      taxableBaseCents: 900,
      vatCents: 107,
      totalCents: 1007,
    });
  });

  it("à égalité de reste, donne le centime au taux le plus élevé", () => {
    const result = invoiceVatBreakdown({
      goods: [
        { htCents: 500, vatRate: 20 },
        { htCents: 500, vatRate: 5.5 },
      ],
      allowances: [{ key: "voucher", amountCents: 1 }],
      charges: [],
    });

    expect(result.categories.map((c) => [c.rate, c.allowances[0]?.amountCents])).toEqual([
      [5.5, 0],
      [20, 1],
    ]);
  });

  it("répartit chaque remise à part, une part par nature et par taux", () => {
    const result = invoiceVatBreakdown({
      goods: [
        { htCents: 1000, vatRate: 5.5 },
        { htCents: 3000, vatRate: 20 },
      ],
      allowances: [
        { key: "company", amountCents: 400 },
        { key: "voucher", amountCents: 3 },
      ],
      charges: [],
    });

    // 400 → 100 / 300 ; 3 → 0,75 / 2,25 → 0 / 2 + reste à 5,5 % (0,75 > 0,25).
    expect(result.categories.map((c) => c.allowances)).toEqual([
      [
        { key: "company", amountCents: 100 },
        { key: "voucher", amountCents: 1 },
      ],
      [
        { key: "company", amountCents: 300 },
        { key: "voucher", amountCents: 2 },
      ],
    ]);
  });

  it("une remise égale à la base laisse une base et une TVA nulles", () => {
    const result = invoiceVatBreakdown({
      goods: [{ htCents: 1000, vatRate: 5.5 }],
      allowances: [{ key: "company", amountCents: 1000 }],
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

  it("sans marchandise, un frais à son taux fait seul sa catégorie", () => {
    const result = invoiceVatBreakdown({
      goods: [],
      allowances: [],
      charges: [{ key: "delivery", htCents: 500, vatRate: 20 }],
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

  it("refuse une remise qu'aucune marchandise ne peut porter", () => {
    expect(() =>
      invoiceVatBreakdown({
        goods: [],
        allowances: [{ key: "company", amountCents: 10 }],
        charges: [],
      }),
    ).toThrow(RangeError);
  });

  it("un frais au prorata de bases nulles prend le taux normal", () => {
    const result = invoiceVatBreakdown({
      goods: [],
      allowances: [],
      charges: [{ key: "delivery", htCents: 500, prorataBases: [] }],
    });

    expect(result.categories.map((c) => [c.rate, c.vatCents])).toEqual([[20, 100]]);
  });

  /**
   * Le port suit les bases QU'ON LUI DONNE (200 / 100), pas celles de la
   * facture (1000 / 1000) : 66,67 / 33,33 → 66 / 33 + 1 au plus fort reste.
   * TVA sur base arrondie : 1067 × 5,5 % = 58,685 → 59 ; 1033 × 10 % = 103,3 → 103.
   */
  it("répartit un port qui suit la marchandise au prorata de ses propres bases", () => {
    const result = invoiceVatBreakdown({
      goods: [
        { htCents: 1000, vatRate: 5.5 },
        { htCents: 1000, vatRate: 10 },
      ],
      allowances: [],
      charges: [
        {
          key: "delivery",
          htCents: 100,
          prorataBases: [
            { htCents: 200, vatRate: 5.5 },
            { htCents: 100, vatRate: 10 },
          ],
        },
      ],
    });

    expect(
      result.categories.map((c) => [c.charges[0]?.amountCents, c.taxableBaseCents, c.vatCents]),
    ).toEqual([
      [67, 1067, 59],
      [33, 1033, 103],
    ]);
    expect(result).toMatchObject({ chargesCents: 100, vatCents: 162, totalCents: 2262 });
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
      allowances: [{ key: "company", amountCents: 1 }],
      charges: [{ key: "late_fee", htCents: 200, vatRate: 10 }],
    });

    expect(result.categories.map((c) => [c.rate, c.taxableBaseCents, c.vatCents])).toEqual([
      [5.5, 999, 55],
      [10, 200, 20],
    ]);
  });
});
