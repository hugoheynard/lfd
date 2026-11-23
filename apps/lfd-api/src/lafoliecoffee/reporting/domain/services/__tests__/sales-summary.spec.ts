import { summarizeSales, type SummaryOrderFacts } from "../sales-summary.js";

const DAY = "2026-03-10";

function order(overrides: Partial<SummaryOrderFacts> = {}): SummaryOrderFacts {
  return {
    day: DAY,
    clientele: "pro",
    countsAsRevenue: true,
    totalCents: 1055,
    vatCents: 55,
    goodsCents: 1000,
    vatByRate: [{ rate: 5.5, vatCents: 55 }],
    returnRefundedCents: 0,
    ...overrides,
  };
}

describe("summarizeSales — le résumé par jour de passation", () => {
  it("sert chaque jour de la période, à zéro s'il n'a rien vendu", () => {
    const [empty] = summarizeSales([DAY], [], []);

    expect(empty).toMatchObject({
      day: DAY,
      orders: 0,
      revenueHtCents: 0,
      revenueTtcCents: 0,
      vatByRate: [],
      netRevenueTtcCents: 0,
      creditNotesTtcCents: 0,
    });
    expect(empty?.byClientele.unknown.orders).toBe(0);
  });

  it("ne somme que les commandes qui comptent dans le CA, rangées par clientèle", () => {
    const [day] = summarizeSales(
      [DAY],
      [
        order(),
        order({
          clientele: "public",
          totalCents: 2110,
          vatCents: 110,
          vatByRate: [{ rate: 5.5, vatCents: 110 }],
          returnRefundedCents: 500,
        }),
        order({ clientele: null }),
        order({ countsAsRevenue: false, totalCents: 99_999 }),
      ],
      [],
    );

    expect(day).toMatchObject({
      orders: 3,
      revenueTtcCents: 4220,
      vatCents: 220,
      revenueHtCents: 4000,
      returnRefundedCents: 500,
      netRevenueTtcCents: 3720,
      vatByRate: [{ rate: 5.5, vatCents: 220 }],
    });
    expect(day?.byClientele.public).toMatchObject({ orders: 1, revenueTtcCents: 2110 });
    expect(day?.byClientele.unknown).toMatchObject({ orders: 1, revenueTtcCents: 1055 });
  });

  it("sert les deux HT : le total compte port et pénalité, les marchandises non", () => {
    // 10 € de marchandises, 3 € de port et 2 € de pénalité, TVA 0,83 € : 15,83 € TTC.
    const [day] = summarizeSales(
      [DAY],
      [order({ totalCents: 1583, vatCents: 83, goodsCents: 1000, vatByRate: null })],
      [],
    );

    expect(day).toMatchObject({ revenueHtCents: 1500, goodsHtCents: 1000 });
    expect(day?.byClientele.pro).toMatchObject({ revenueHtCents: 1500, goodsHtCents: 1000 });
  });

  it("rend une TVA par taux nulle plutôt qu'une somme trouée", () => {
    const [day] = summarizeSales([DAY], [order(), order({ vatByRate: null })], []);

    expect(day?.vatByRate).toBeNull();
    expect(day?.vatCents).toBe(110);
  });

  it("range les avoirs à leur jour d'émission, à part du CA", () => {
    const [first, second] = summarizeSales(
      [DAY, "2026-03-11"],
      [order()],
      [{ issuedOn: "2026-03-11", htCents: 1000, vatCents: 55, ttcCents: 1055 }],
    );

    expect(first).toMatchObject({ revenueTtcCents: 1055, creditNotesTtcCents: 0 });
    expect(second).toMatchObject({
      revenueTtcCents: 0,
      creditNotesHtCents: 1000,
      creditNotesTtcCents: 1055,
    });
  });
});
