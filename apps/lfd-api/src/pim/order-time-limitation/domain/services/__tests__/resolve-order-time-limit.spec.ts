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
 * Décision de Hugo du 2026-10-21 (`limites-de-commande/schema-des-reglages.md`
 * §4, points 1 à 3) : une limite par PRODUIT, règle entière, sans rattrapage.
 * Tout autre rang encore en base est ignoré — c'est ce qui le rend inerte sans
 * migration destructive.
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
    });
  });

  /** Régression voulue : un « Toute la production » résiduel ne ferme plus rien. */
  it("ignore un rang global résiduel", () => {
    const rules = [rule("global", null, { daysBefore: 1, time: "18:00", graceMinutes: 60 })];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });

  it("ignore une famille et une déclinaison résiduelles", () => {
    const rules = [
      rule("category", "patisserie", { daysBefore: 1, time: "16:00" }),
      rule("variant", "v1", { daysBefore: 3, time: "10:00" }),
      rule("product", "p1", { daysBefore: 2, time: "12:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: 2,
      time: "12:00",
      graceMinutes: 0,
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

  it("ignore les règles qui visent un autre produit", () => {
    const rules = [rule("product", "p2", { daysBefore: 1, time: "18:00" })];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });
});

describe("explainOrderTimeLimit", () => {
  it("dit que délai et heure viennent du produit, sans rattrapage", () => {
    const rules = [rule("product", "p1", { daysBefore: 1, time: "18:00", graceMinutes: 30 })];

    expect(explainOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: { value: 1, from: "product" },
      time: { value: "18:00", from: "product" },
      graceMinutes: null,
    });
  });
});
