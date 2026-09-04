import { categoryPathOf, resolveOrderTimeLimit } from "../order-time-limit-resolution.js";
import type { SyncOrderTimeLimitRule } from "../snapshot.js";

/**
 * La descente de l'échelle, éprouvée **là où elle vit désormais**.
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

describe("resolveOrderTimeLimit sur un arbre", () => {
  it("compose les rangs champ par champ en remontant l'arbre", () => {
    // La racine pose le délai, la famille proche pose l'heure : ni l'une ni
    // l'autre ne se suffit, et ensemble elles font une limite.
    const rules = [
      rule({ scope: { type: "category", id: "boulangerie" }, daysBefore: 1 }),
      rule({ scope: { type: "category", id: "pain" }, time: "16:00" }),
    ];

    expect(
      resolveOrderTimeLimit(rules, {
        variantId: "var_1",
        productId: "prd_1",
        categoryPath: categoryPathOf(TREE, "pain"),
      }),
    ).toEqual({ daysBefore: 1, time: "16:00", graceMinutes: 0 });
  });

  it("laisse deux familles voisines diverger", () => {
    const rules = [
      rule({ scope: { type: "category", id: "boulangerie" }, daysBefore: 1, time: "18:00" }),
      rule({ scope: { type: "category", id: "pain" }, time: "16:00" }),
    ];
    const target = (categoryId: string) => ({
      variantId: "var_1",
      productId: "prd_1",
      categoryPath: categoryPathOf(TREE, categoryId),
    });

    expect(resolveOrderTimeLimit(rules, target("pain"))?.time).toBe("16:00");
    expect(resolveOrderTimeLimit(rules, target("viennoiserie"))?.time).toBe("18:00");
  });

  it("ne rend rien quand la lignée ne donne pas le jour ET l'heure", () => {
    // Une heure sans délai ne se compare à rien : inventer « la veille » ferait
    // refuser des commandes au nom d'une règle que personne n'a écrite.
    const rules = [rule({ scope: { type: "category", id: "pain" }, time: "16:00" })];

    expect(
      resolveOrderTimeLimit(rules, {
        variantId: "var_1",
        productId: "prd_1",
        categoryPath: categoryPathOf(TREE, "pain"),
      }),
    ).toBeNull();
  });

  it("ne rend rien sans aucune règle", () => {
    expect(
      resolveOrderTimeLimit([], { variantId: "var_1", productId: "prd_1", categoryPath: ["pain"] }),
    ).toBeNull();
  });
});
