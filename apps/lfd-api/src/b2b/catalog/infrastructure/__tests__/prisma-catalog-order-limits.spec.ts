import { orderLimitGroups } from "../prisma-catalog-order-limits.js";

/** La descente des limites, regroupée par limite identique. */

const NOON = { daysBefore: 1, time: "12:00", graceMinutes: 0 };
const EVENING = { daysBefore: 1, time: "18:00", graceMinutes: 15 };

describe("orderLimitGroups", () => {
  // P2028 (2026-10-17) : une écriture par article sur tout le catalogue allongeait la transaction.
  it("rend autant de groupes que de limites distinctes, pas d'articles", () => {
    const changes = Array.from({ length: 70 }, (_, index) => ({
      sku: `S-${String(index)}`,
      limit: index % 3 === 0 ? null : index % 2 === 0 ? NOON : EVENING,
    }));

    const groups = orderLimitGroups(changes);

    expect(groups).toHaveLength(3);
    expect(groups.flatMap((group) => group.skus)).toHaveLength(70);
  });

  it("garde « aucune limite » comme une valeur à écrire", () => {
    expect(orderLimitGroups([{ sku: "A", limit: null }])).toEqual([{ limit: null, skus: ["A"] }]);
  });
});
