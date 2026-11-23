import type { OrderTimeLimitScopeType, OrderTimeLimitView } from "@lfd/pim-contracts";

import {
  explainOrderTimeLimit,
  resolveOrderTimeLimit,
  type LimitTarget,
} from "../resolve-order-time-limit.js";

/**
 * Aucune date absolue ici, et pour une fois ce n'est même pas une précaution :
 * la résolution ne connaît pas l'horloge. Elle dit ce qu'une règle VAUT, jamais
 * si l'on est en retard — cette comparaison-là appartient à qui tient l'heure.
 */
function rule(
  type: OrderTimeLimitScopeType,
  id: string | null,
  values: Partial<Pick<OrderTimeLimitView, "daysBefore" | "time" | "graceMinutes">> = {},
): OrderTimeLimitView {
  return {
    id: `${type}:${id ?? ""}`,
    scope: { type, id },
    scopeLabel: null,
    daysBefore: null,
    time: null,
    graceMinutes: null,
    archived: false,
    staffMayExceed: false,
    excludedProductIds: [],
    ...values,
  };
}

/** Un entremets : déclinaison `v1` du produit `p1`, famille « pâtisserie » sous « sucré ». */
const ENTREMETS: LimitTarget = {
  variantId: "v1",
  productId: "p1",
  categoryPath: ["patisserie", "sucre"],
};

/**
 * Décisions de Hugo (2026-10-21 et 2026-11-23) : une limite par produit ou par
 * famille, règle entière, sans rattrapage ; la plus stricte gagne. Un rang
 * « global » ou « déclinaison » encore en base est ignoré — c'est ce qui le
 * rend inerte sans migration destructive.
 */
describe("resolveOrderTimeLimit", () => {
  it("ne rend rien quand aucune règle n'existe", () => {
    expect(resolveOrderTimeLimit([], ENTREMETS)).toBeNull();
  });

  it("rend la limite posée sur le produit", () => {
    const rules = [rule("product", "p1", { daysBefore: 2, time: "12:00" })];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: 2,
      time: "12:00",
      graceMinutes: 0,
      staffMayExceed: false,
    });
  });

  /** Régression voulue : un « Toute la production » résiduel ne ferme plus rien. */
  it("ignore un rang global résiduel", () => {
    const rules = [rule("global", null, { daysBefore: 1, time: "18:00", graceMinutes: 60 })];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });

  it("ignore une déclinaison résiduelle, et garde le produit quand il est plus strict que sa famille", () => {
    const rules = [
      rule("category", "patisserie", { daysBefore: 1, time: "16:00" }),
      rule("variant", "v1", { daysBefore: 3, time: "10:00" }),
      rule("product", "p1", { daysBefore: 2, time: "12:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: 2,
      time: "12:00",
      graceMinutes: 0,
      staffMayExceed: false,
    });
  });

  it("n'hérite plus champ par champ : une heure seule ne fait pas une limite", () => {
    const rules = [
      rule("global", null, { daysBefore: 1 }),
      rule("product", "p1", { time: "16:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });

  it("traite une grâce résiduelle du produit comme nulle", () => {
    const rules = [rule("product", "p1", { daysBefore: 0, time: "19:00", graceMinutes: 60 })];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)?.graceMinutes).toBe(0);
  });

  it("applique la famille quand elle est plus stricte que le produit", () => {
    const rules = [
      rule("category", "sucre", { daysBefore: 3, time: "12:00" }),
      rule("product", "p1", { daysBefore: 2, time: "12:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)?.daysBefore).toBe(3);
  });

  it("n'applique pas la famille au produit qu'elle exclut", () => {
    const rules = [
      {
        ...rule("category", "patisserie", { daysBefore: 3, time: "12:00" }),
        excludedProductIds: ["p1"],
      },
    ];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });

  it("ignore les règles qui visent un autre produit", () => {
    const rules = [rule("product", "p2", { daysBefore: 1, time: "18:00" })];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });
});

describe("explainOrderTimeLimit", () => {
  it("dit que la limite vient du produit, sans rattrapage", () => {
    const rules = [rule("product", "p1", { daysBefore: 1, time: "18:00", graceMinutes: 30 })];

    expect(explainOrderTimeLimit(rules, ENTREMETS)).toEqual({
      limit: { daysBefore: 1, time: "18:00", graceMinutes: 0, staffMayExceed: false },
      from: { type: "product", id: "p1" },
    });
  });
});
