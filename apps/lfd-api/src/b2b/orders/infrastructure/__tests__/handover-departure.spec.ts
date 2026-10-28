import { departingPieces, departureOf } from "../handover-order.query.js";

const DECIDED_AT = new Date(Date.now() - 60 * 60 * 1000);

function row(decided: boolean) {
  return {
    id: "ord_1",
    lines: [
      { sku: "CRO", productNameSnapshot: "Croissant", quantity: 4, saleUnit: "piece" as const },
      {
        sku: "PAC",
        productNameSnapshot: "Pain au chocolat",
        quantity: 3,
        saleUnit: "piece" as const,
      },
    ],
    shortfalls: [
      {
        lines: [
          { sku: "CRO", due: 4, packed: 2 },
          { sku: "PAC", due: 3, packed: 3 },
        ],
        decision: decided
          ? {
              decidedAt: DECIDED_AT,
              decidedByStaffId: "staff_1",
              remainder: "abandoned",
              departing: [
                { sku: "CRO", quantity: 2 },
                { sku: "PAC", quantity: 3 },
              ],
            }
          : null,
      },
    ],
  };
}

describe("departureOf — ce que le comptoir tend", () => {
  it("sans décision, rend les quantités commandées et aucun reste", () => {
    const out = departureOf(row(false));
    expect(out.lines.map((l) => l.quantity)).toEqual([4, 3]);
    expect(out.abandoned).toEqual([]);
    expect(out.remainder).toBeNull();
  });

  /** Régression : le comptoir affichait les quantités commandées d'un départ incomplet décidé (2026-10-25). */
  it("après décision, rend ce qui PART et nomme le reste abandonné", () => {
    const out = departureOf(row(true));
    expect(out.lines.map((l) => l.quantity)).toEqual([2, 3]);
    expect(out.abandoned).toEqual([
      { sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece" as const },
    ]);
    expect(out.remainder).toBe("abandoned");
  });
});

/** P6 de `pricing/plan-vente-au-poids.md` : une commande mêlée, et un manquant partiel au poids. */
describe("departureOf — au poids", () => {
  function mixed(departingSalmon: number) {
    return {
      id: "ord_2",
      lines: [
        { sku: "CRO", productNameSnapshot: "Croissant", quantity: 12, saleUnit: "piece" },
        { sku: "SAU", productNameSnapshot: "Saumon gravlax", quantity: 1250, saleUnit: "weight" },
      ],
      shortfalls: [
        {
          lines: [
            { sku: "CRO", due: 12, packed: 12 },
            { sku: "SAU", due: 1250, packed: departingSalmon },
          ],
          decision: {
            decidedAt: DECIDED_AT,
            decidedByStaffId: "staff_1",
            remainder: "abandoned",
            departing: [
              { sku: "CRO", quantity: 12 },
              { sku: "SAU", quantity: departingSalmon },
            ],
          },
        },
      ],
    };
  }

  it("fait partir le lot au bac en grammes, et nomme le reste en grammes", () => {
    const out = departureOf(mixed(1000));
    expect(out.lines).toEqual([
      { sku: "CRO", productName: "Croissant", quantity: 12, saleUnit: "piece" },
      { sku: "SAU", productName: "Saumon gravlax", quantity: 1000, saleUnit: "weight" },
    ]);
    expect(out.abandoned).toEqual([
      { sku: "SAU", productName: "Saumon gravlax", quantity: 250, saleUnit: "weight" },
    ]);
  });

  it("compte au comptoir 12 croissants et UNE ligne au poids — jamais 1 012", () => {
    expect(departingPieces(departureOf(mixed(1000)).lines)).toBe(13);
  });

  it("un lot au poids qui ne part pas du tout ne compte pour rien", () => {
    expect(departingPieces(departureOf(mixed(0)).lines)).toBe(12);
  });

  it("refuse une unité stockée inconnue plutôt que de la lire en pièces", () => {
    const row = mixed(1000);
    expect(() =>
      departureOf({
        ...row,
        lines: [{ sku: "SAU", productNameSnapshot: "Saumon", quantity: 1250, saleUnit: "kg" }],
      }),
    ).toThrow(/unité inconnue/u);
  });
});
