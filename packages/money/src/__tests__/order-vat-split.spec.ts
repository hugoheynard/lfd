import { splitCents, splitOrderByRate, type RatedCents } from "../order-vat-split.js";
import { ventilateVat, type VatLine, type VatVentilationInput } from "../vat.js";

const sumOf = (parts: readonly RatedCents[]): number =>
  parts.reduce((total, part) => total + part.amountCents, 0);

describe("splitCents", () => {
  /**
   * 333 / 333 / 334 sur 1000, 100 à découper : 33,3 / 33,3 / 33,4 → planchers
   * 33 / 33 / 33, le centime restant au plus fort reste (20 %, 0,4).
   */
  it("découpe aux plus forts restes, sa somme exactement", () => {
    const parts = splitCents(
      100,
      new Map([
        [5.5, 333n],
        [10, 333n],
        [20, 334n],
      ]),
    );

    expect([...parts.entries()]).toEqual([
      [5.5, 33],
      [10, 33],
      [20, 34],
    ]);
  });

  it("à égalité de reste, donne le centime au taux le plus BAS (R2)", () => {
    const parts = splitCents(
      1,
      new Map([
        [20, 500n],
        [5.5, 500n],
      ]),
    );

    expect(parts.get(5.5)).toBe(1);
    expect(parts.get(20)).toBe(0);
  });

  it("sans poids, ne découpe rien", () => {
    expect(splitCents(100, new Map()).size).toBe(0);
  });
});

describe("splitOrderByRate", () => {
  const PAIN: VatLine = { htCents: 1000, vatRate: 5.5 };
  const BOISSON: VatLine = { htCents: 3000, vatRate: 20 };

  it("découpe le bon de fidélité sur le NET que la remise de retrait a laissé (R1.2)", () => {
    // Retrait : 200 sur le seul pain éligible → net 800 / 3000.
    // Fidélité : 380 × 800 / 3800 = 80 ; × 3000 / 3800 = 300.
    const split = splitOrderByRate({
      lines: [PAIN, { ...BOISSON, discountEligible: false }],
      eligibleDiscountCents: 200,
      discountCents: 380,
      extras: [],
    });

    expect(split.eligibleDiscount).toEqual([{ vatRate: 5.5, amountCents: 200 }]);
    expect(split.discount).toEqual([
      { vatRate: 5.5, amountCents: 80 },
      { vatRate: 20, amountCents: 300 },
    ]);
  });

  /**
   * Une remise de retrait qui absorbe tout le taux éligible, puis un bon de
   * fidélité : sur le brut, une part du bon tomberait sur le pain déjà soldé,
   * et sa base deviendrait négative.
   */
  it("une remise qui absorbe tout un taux, puis un bon : aucune base négative", () => {
    const split = splitOrderByRate({
      lines: [PAIN, { ...BOISSON, discountEligible: false }],
      eligibleDiscountCents: 1000,
      discountCents: 500,
      extras: [],
    });

    expect(split.eligibleDiscount).toEqual([{ vatRate: 5.5, amountCents: 1000 }]);
    expect(split.discount).toEqual([{ vatRate: 20, amountCents: 500 }]);
  });

  it("borne les remises comme le bon : la restreinte à l'éligible, le bon au net", () => {
    const split = splitOrderByRate({
      lines: [PAIN, { ...BOISSON, discountEligible: false }],
      eligibleDiscountCents: 5000,
      discountCents: 9000,
      extras: [],
    });

    expect(sumOf(split.eligibleDiscount)).toBe(1000);
    expect(sumOf(split.discount)).toBe(3000);
  });

  it("découpe le port qui suit la marchandise sur les bases BRUTES (R1.3)", () => {
    // 100 × 1000 / 4000 = 25 ; × 3000 / 4000 = 75 — la remise n'y change rien.
    const split = splitOrderByRate({
      lines: [PAIN, BOISSON],
      discountCents: 3500,
      extras: [{ htCents: 100, followsGoods: true }],
    });

    expect(split.extras).toEqual([
      [
        { vatRate: 5.5, amountCents: 25 },
        { vatRate: 20, amountCents: 75 },
      ],
    ]);
  });

  it("garde un extra à son taux, et met au taux normal un port sans marchandise", () => {
    const split = splitOrderByRate({
      lines: [],
      discountCents: 0,
      extras: [
        { htCents: 300, vatRate: 10 },
        { htCents: 500, followsGoods: true },
      ],
    });

    expect(split.extras).toEqual([
      [{ vatRate: 10, amountCents: 300 }],
      [{ vatRate: 20, amountCents: 500 }],
    ]);
  });

  /**
   * Sur des bons tirés d'une suite déterministe : chaque montant se découpe en
   * parts dont la somme vaut ce que `ventilateVat` a appliqué (BR-CO-11), et
   * aucune base par taux ne devient négative.
   */
  it("pour tout bon : Σ parts = montant appliqué, et aucune base négative", () => {
    for (const input of generatedOrders(400)) {
      const split = splitOrderByRate(input);
      const ventilated = ventilateVat(input);

      expect(sumOf(split.eligibleDiscount) + sumOf(split.discount)).toBe(ventilated.discountCents);
      split.extras.forEach((parts, index) => {
        expect(sumOf(parts)).toBe(input.extras[index]?.htCents);
      });
      for (const rate of new Set(input.lines.map((line) => line.vatRate))) {
        const goods = input.lines
          .filter((line) => line.vatRate === rate)
          .reduce((total, line) => total + line.htCents, 0);
        const off = [...split.eligibleDiscount, ...split.discount]
          .filter((part) => part.vatRate === rate)
          .reduce((total, part) => total + part.amountCents, 0);
        expect(goods - off).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

const RATES = [5.5, 10, 20] as const;

/** Une suite pseudo-aléatoire déterministe : un test qui rejoue toujours la même chose. */
function* generatedOrders(count: number): Generator<VatVentilationInput> {
  let seed = 20261022;
  const next = (bound: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % bound;
  };
  for (let i = 0; i < count; i += 1) {
    const lines: VatLine[] = Array.from({ length: 1 + next(4) }, () => ({
      htCents: 1 + next(3000),
      vatRate: RATES[next(RATES.length)] ?? 20,
      discountEligible: next(3) !== 0,
    }));
    yield {
      lines,
      eligibleDiscountCents: next(2000),
      discountCents: next(2) === 0 ? 0 : next(4000),
      extras: next(2) === 0 ? [] : [{ htCents: next(900), followsGoods: true }],
    };
  }
}
