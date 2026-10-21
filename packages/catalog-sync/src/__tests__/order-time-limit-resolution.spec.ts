import { categoryPathOf, resolveOrderTimeLimit } from "../order-time-limit-resolution.js";
import type { SyncOrderTimeLimitRule } from "../snapshot.js";

/**
 * La résolution, éprouvée **là où elle vit** — partagée par les deux rives.
 *
 * Ces cas venaient de `resolveLimitsByVariant`, côté référentiel, qui résolvait
 * avant d'émettre. La v7 envoie les rangs et fait descendre les deux rives par
 * cette fonction-ci : la couverture devait suivre, sans quoi elle serait partie
 * avec le fichier qui la portait.
 *
 * `resolveOrderTimeLimit` a par ailleurs sa propre suite côté référentiel
 * (`resolve-order-time-limit.spec.ts`, 26 cas) : celle-ci ne la redouble pas,
 * elle couvre ce que l'autre ne voit pas — la remontée d'ARBRE, et ce qui se
 * passe quand l'arbre est faux.
 */
function rule(over: Partial<SyncOrderTimeLimitRule> = {}): SyncOrderTimeLimitRule {
  return {
    scope: { type: "global", id: null },
    daysBefore: null,
    time: null,
    graceMinutes: null,
    ...over,
  };
}

const TREE = [
  { id: "boulangerie", parentId: null },
  { id: "pain", parentId: "boulangerie" },
  { id: "viennoiserie", parentId: "boulangerie" },
];

describe("categoryPathOf", () => {
  it("rend la famille puis ses ancêtres, du plus proche à la racine", () => {
    expect(categoryPathOf(TREE, "pain")).toEqual(["pain", "boulangerie"]);
  });

  it("rend un chemin vide pour une famille absente de l'arbre", () => {
    // Un produit rangé dans une famille que le snapshot ne porte pas ne doit pas
    // faire échouer la résolution : il n'hérite simplement d'aucune famille.
    expect(categoryPathOf(TREE, "inconnue")).toEqual(["inconnue"]);
    expect(categoryPathOf(TREE, null)).toEqual([]);
  });

  /**
   * 🔴 Un arbre cyclique ne fige pas le processus.
   *
   * L'arbre est censé ne pas en avoir, mais « censé » n'est pas une garantie
   * qu'on veut voir tomber sous la forme d'un push qui ne rend jamais la main :
   * une limite oubliée se voit, une boucle infinie non.
   */
  it("ne boucle pas sur un arbre cyclique", () => {
    const cycle = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];

    expect(categoryPathOf(cycle, "a")).toEqual(["a", "b"]);
  });
});

/**
 * Décision de Hugo du 2026-10-21 (`limites-de-commande/schema-des-reglages.md`
 * §4) : une limite par PRODUIT, règle entière, sans rattrapage. Les autres
 * rangs, s'il en reste en base ou dans un fait déjà rangé, sont ignorés.
 */
describe("resolveOrderTimeLimit — le produit seulement", () => {
  const target = { variantId: "var_1", productId: "prd_1", categoryPath: ["pain", "boulangerie"] };

  it("rend la limite du produit", () => {
    const rules = [rule({ scope: { type: "product", id: "prd_1" }, daysBefore: 2, time: "12:00" })];

    expect(resolveOrderTimeLimit(rules, target)).toEqual({
      daysBefore: 2,
      time: "12:00",
      graceMinutes: 0,
    });
  });

  it("ignore un rang global, une famille et une déclinaison résiduels", () => {
    const rules = [
      rule({ scope: { type: "global", id: null }, daysBefore: 1, time: "18:00" }),
      rule({ scope: { type: "category", id: "pain" }, daysBefore: 1, time: "16:00" }),
      rule({ scope: { type: "variant", id: "var_1" }, daysBefore: 3, time: "10:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, target)).toBeNull();
  });

  it("n'emprunte plus rien à une famille quand le produit ne pose qu'une heure", () => {
    const rules = [
      rule({ scope: { type: "category", id: "pain" }, daysBefore: 1 }),
      rule({ scope: { type: "product", id: "prd_1" }, time: "16:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, target)).toBeNull();
  });

  /** Le seul rattrapage est celui de la règle générale (2026-10-21, point 2). */
  it("traite une grâce résiduelle du produit comme nulle", () => {
    const rules = [
      rule({
        scope: { type: "product", id: "prd_1" },
        daysBefore: 0,
        time: "19:00",
        graceMinutes: 60,
      }),
    ];

    expect(resolveOrderTimeLimit(rules, target)?.graceMinutes).toBe(0);
  });

  it("ne rend rien sans aucune règle", () => {
    expect(resolveOrderTimeLimit([], target)).toBeNull();
  });
});
