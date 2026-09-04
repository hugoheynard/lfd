import type { OrderTimeLimitScopeType, OrderTimeLimitView } from "@lfd/pim-contracts";

import {
  resolveLimitsByVariant,
  type CategoryNode,
  type LimitTargetProduct,
} from "../order-time-limits.js";

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

/**
 * Un produit réduit à ce que la résolution regarde — et le port est écrit pour
 * que ce soit suffisant. Aucun cast : si le doublage demandait une fiche
 * complète, c'est la signature qui serait trop large.
 */
function product(
  id: string,
  categoryId: string,
  variantIds: readonly string[],
): LimitTargetProduct {
  return { id, categoryId, variants: variantIds.map((variantId) => ({ id: variantId })) };
}

/** « pâtisserie » sous « sucré », et « boissons » à la racine. */
const TREE: readonly CategoryNode[] = [
  { id: "sucre", parentId: null },
  { id: "patisserie", parentId: "sucre" },
  { id: "boissons", parentId: null },
];

describe("resolveLimitsByVariant", () => {
  it("ne rend rien quand aucune règle n'existe", () => {
    const map = resolveLimitsByVariant([product("p1", "patisserie", ["v1"])], TREE, []);
    expect(map.size).toBe(0);
  });

  it("donne à chaque déclinaison la limite résolue de son produit", () => {
    const map = resolveLimitsByVariant([product("p1", "patisserie", ["v1", "v2"])], TREE, [
      rule("global", null, { daysBefore: 1, time: "18:00" }),
    ]);
    expect(map.get("v1")).toEqual({ daysBefore: 1, time: "18:00", graceMinutes: 0 });
    expect(map.get("v2")).toEqual({ daysBefore: 1, time: "18:00", graceMinutes: 0 });
  });

  /**
   * La remontée d'arbre s'arrête au **plus proche ancêtre qui se prononce**, et
   * l'héritage reste champ par champ jusque dans le fil.
   */
  it("remonte l'arbre et compose les rangs champ par champ", () => {
    const map = resolveLimitsByVariant([product("p1", "patisserie", ["v1"])], TREE, [
      rule("global", null, { daysBefore: 1, time: "18:00", graceMinutes: 30 }),
      rule("category", "sucre", { daysBefore: 4 }),
      rule("category", "patisserie", { time: "16:00" }),
    ]);
    expect(map.get("v1")).toEqual({ daysBefore: 4, time: "16:00", graceMinutes: 30 });
  });

  it("laisse deux familles voisines diverger", () => {
    const map = resolveLimitsByVariant(
      [product("p1", "patisserie", ["v1"]), product("p2", "boissons", ["v2"])],
      TREE,
      [
        rule("global", null, { daysBefore: 1, time: "18:00" }),
        rule("category", "boissons", { daysBefore: 0, time: "23:00" }),
      ],
    );
    expect(map.get("v1")?.time).toBe("18:00");
    expect(map.get("v2")).toEqual({ daysBefore: 0, time: "23:00", graceMinutes: 0 });
  });

  /**
   * Une déclinaison **sans limite** est absente de la carte. Une entrée à `null`
   * dirait la même chose plus longuement, et l'immense majorité du catalogue est
   * dans ce cas.
   */
  it("laisse hors de la carte ce qui n'a pas de limite complète", () => {
    const map = resolveLimitsByVariant(
      [product("p1", "patisserie", ["v1"])],
      TREE,
      // Des jours sans heure : rien de comparable, donc rien à envoyer.
      [rule("global", null, { daysBefore: 2 })],
    );
    expect(map.has("v1")).toBe(false);
  });

  it("accepte un produit dont la famille est inconnue de l'arbre", () => {
    const map = resolveLimitsByVariant([product("p1", "famille_disparue", ["v1"])], TREE, [
      rule("global", null, { daysBefore: 1, time: "18:00" }),
    ]);
    // Le global s'applique quand même : une famille absente n'est pas une raison
    // de perdre la règle qui vaut pour tout le monde.
    expect(map.get("v1")?.daysBefore).toBe(1);
  });

  /**
   * 🔴 **Un cycle ne fait pas boucler le push.** L'arbre est censé ne pas en
   * avoir ; « censé » n'est pas une garantie qu'on veut voir tomber sous la
   * forme d'un processus figé, qui ne rendrait jamais la main et ne dirait
   * jamais pourquoi.
   */
  it("ne boucle pas sur un arbre cyclique", () => {
    const cycle: readonly CategoryNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    const map = resolveLimitsByVariant([product("p1", "a", ["v1"])], cycle, [
      rule("category", "b", { daysBefore: 3, time: "10:00" }),
    ]);
    expect(map.get("v1")).toEqual({ daysBefore: 3, time: "10:00", graceMinutes: 0 });
  });
});
