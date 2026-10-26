import { departureOf } from "../handover-order.query.js";

const DECIDED_AT = new Date(Date.now() - 60 * 60 * 1000);

function row(decided: boolean) {
  return {
    id: "ord_1",
    lines: [
      { sku: "CRO", productNameSnapshot: "Croissant", quantity: 4 },
      { sku: "PAC", productNameSnapshot: "Pain au chocolat", quantity: 3 },
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
    expect(out.abandoned).toEqual([{ sku: "CRO", productName: "Croissant", quantity: 2 }]);
    expect(out.remainder).toBe("abandoned");
  });
});
