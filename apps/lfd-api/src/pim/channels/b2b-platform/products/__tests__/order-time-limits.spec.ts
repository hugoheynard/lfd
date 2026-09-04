import type { OrderTimeLimitScopeType, OrderTimeLimitView } from "@lfd/pim-contracts";

import { toSyncRule } from "../order-time-limits.js";

/**
 * Ce que ces cas tiennent : **ce qui traverse, et surtout ce qui ne traverse
 * pas**.
 *
 * `resolveLimitsByVariant` a disparu avec la v7 du fil — la descente d'échelle
 * vit désormais dans `@lfd/catalog-sync`, et ce sont les RANGS qui voyagent. Il
 * ne reste ici qu'une conversion, dont le typage ne prouve rien : TypeScript
 * accepte le surplus dès que l'objet n'est pas un littéral, si bien que rendre
 * la vue telle quelle compilerait. Les assertions portent donc sur les CLÉS.
 */

function view(
  type: OrderTimeLimitScopeType,
  id: string | null,
  over: Partial<Omit<OrderTimeLimitView, "scope">> = {},
): OrderTimeLimitView {
  return {
    id: `otl_${type}`,
    scope: { type, id },
    scopeLabel: "Pâtisserie",
    daysBefore: null,
    time: null,
    graceMinutes: null,
    ...over,
  };
}

describe("toSyncRule", () => {
  it("recopie la portée et les trois valeurs", () => {
    const rule = toSyncRule(
      view("category", "patisserie", { daysBefore: 2, time: "16:00", graceMinutes: 30 }),
    );

    expect(rule).toEqual({
      scope: { type: "category", id: "patisserie" },
      daysBefore: 2,
      time: "16:00",
      graceMinutes: 30,
    });
  });

  /**
   * 🔴 LE cas qui justifie la conversion à la main. `id` et `scopeLabel` sont le
   * NOM de la famille visée et la clé du référentiel : entrés dans le snapshot,
   * ils entreraient dans son empreinte, et renommer une famille produirait une
   * livraison à valider — pour une décision que personne n'a prise sur le
   * catalogue.
   */
  it("ne laisse passer NI l'identifiant de la règle, NI le libellé de sa portée", () => {
    const rule = toSyncRule(view("category", "patisserie", { daysBefore: 1, time: "18:00" }));

    expect(Object.keys(rule).sort()).toEqual(["daysBefore", "graceMinutes", "scope", "time"]);
    expect(Object.keys(rule.scope).sort()).toEqual(["id", "type"]);
  });

  /**
   * Les trois valeurs sont **nullables séparément** : c'est l'héritage champ par
   * champ, et une règle qui ne dit que l'heure ne doit pas se mettre à dire un
   * nombre de jours en traversant.
   */
  it("garde les valeurs que le rang ne pose pas à `null`", () => {
    const rule = toSyncRule(view("product", "prd_1", { time: "16:00" }));

    expect(rule).toEqual({
      scope: { type: "product", id: "prd_1" },
      daysBefore: null,
      time: "16:00",
      graceMinutes: null,
    });
  });

  /** Le rang global est le seul dont la cible est `null` — il vise tout le monde. */
  it("recopie le rang global avec sa cible absente", () => {
    const rule = toSyncRule(view("global", null, { daysBefore: 0, time: "23:00" }));

    expect(rule.scope).toEqual({ type: "global", id: null });
  });

  it("recopie une portée de déclinaison, que la v7 est seule à savoir viser", () => {
    const rule = toSyncRule(view("variant", "var_1", { daysBefore: 1, time: "10:00" }));

    expect(rule.scope).toEqual({ type: "variant", id: "var_1" });
  });
});
