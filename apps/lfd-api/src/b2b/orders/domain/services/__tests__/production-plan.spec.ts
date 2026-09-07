import type { OrderStatus } from "@lfd/contracts";

import { absorbedByPlan } from "../production-plan.js";

describe("le plan du soir", () => {
  it("absorbe une commande passée — c'est exactement ce qu'il attend", () => {
    expect(absorbedByPlan("placed")).toBe(true);
  });

  it.each<OrderStatus>(["confirmed", "in_production", "ready", "fulfilled"])(
    "ne fait pas RECULER une commande déjà à l'état %s",
    (status) => {
      // Les états ne reculent jamais. Reconfirmer une commande déjà en
      // fabrication effacerait le fait qu'elle l'était.
      expect(absorbedByPlan(status)).toBe(false);
    },
  );

  it("laisse une commande annulée dehors — elle n'est plus à produire", () => {
    expect(absorbedByPlan("cancelled")).toBe(false);
  });

  it("laisse un brouillon dehors — il n'existe pas encore", () => {
    expect(absorbedByPlan("draft")).toBe(false);
  });

  it("rend la clôture IDEMPOTENTE par sa règle, pas par un garde", () => {
    // Une journée close une seconde fois ne contient plus aucune `placed` :
    // zéro commande à absorber, sans qu'aucun verrou n'ait été posé.
    const secondPass = (["confirmed", "cancelled"] as const).filter(absorbedByPlan);

    expect(secondPass).toEqual([]);
  });
});
