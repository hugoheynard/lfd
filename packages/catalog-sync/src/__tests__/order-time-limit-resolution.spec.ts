import {
  categoryPathOf,
  explainOrderTimeLimit,
  resolveOrderTimeLimit,
} from "../order-time-limit-resolution.js";
import { syncOrderTimeLimitRuleSchema, type SyncOrderTimeLimitRule } from "../snapshot.js";

/**
 * La résolution, éprouvée **là où elle vit** — partagée par les deux rives.
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
    staffMayExceed: false,
    excludedProductIds: [],
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

/** Une limite par produit, règle entière, sans rattrapage ; global et déclinaison ne visent rien. */
describe("resolveOrderTimeLimit — le produit", () => {
  const target = { variantId: "var_1", productId: "prd_1", categoryPath: ["pain", "boulangerie"] };

  it("rend la limite du produit", () => {
    const rules = [rule({ scope: { type: "product", id: "prd_1" }, daysBefore: 2, time: "12:00" })];

    expect(resolveOrderTimeLimit(rules, target)).toEqual({
      daysBefore: 2,
      time: "12:00",
      graceMinutes: 0,
      staffMayExceed: false,
    });
  });

  it("ignore un rang global et une déclinaison résiduels", () => {
    const rules = [
      rule({ scope: { type: "global", id: null }, daysBefore: 1, time: "18:00" }),
      rule({ scope: { type: "variant", id: "var_1" }, daysBefore: 3, time: "10:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, target)).toBeNull();
  });

  it("n'emprunte rien à une famille incomplète quand le produit ne pose qu'une heure", () => {
    const rules = [
      rule({ scope: { type: "category", id: "pain" }, daysBefore: 1 }),
      rule({ scope: { type: "product", id: "prd_1" }, time: "16:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, target)).toBeNull();
  });

  it("traite une grâce résiduelle comme nulle", () => {
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

describe("resolveOrderTimeLimit — les familles", () => {
  const target = {
    variantId: null,
    productId: "fraisier",
    categoryPath: ["gateaux", "patisserie"],
  };
  const product = (daysBefore: number, time: string): SyncOrderTimeLimitRule =>
    rule({ scope: { type: "product", id: "fraisier" }, daysBefore, time });
  const family = (
    id: string,
    daysBefore: number,
    time: string,
    excludedProductIds: string[] = [],
  ): SyncOrderTimeLimitRule =>
    rule({ scope: { type: "category", id }, daysBefore, time, excludedProductIds });

  it("applique la limite de la famille seule", () => {
    expect(resolveOrderTimeLimit([family("gateaux", 2, "12:00")], target)).toEqual({
      daysBefore: 2,
      time: "12:00",
      graceMinutes: 0,
      staffMayExceed: false,
    });
  });

  it("garde le produit quand il est plus strict", () => {
    const rules = [family("gateaux", 1, "18:00"), product(2, "12:00")];

    expect(resolveOrderTimeLimit(rules, target)).toMatchObject({ daysBefore: 2, time: "12:00" });
    expect(explainOrderTimeLimit(rules, target)?.from).toEqual({ type: "product", id: "fraisier" });
  });

  it("garde la famille quand elle est plus stricte, à jours égaux par l'heure la plus tôt", () => {
    const rules = [product(1, "18:00"), family("gateaux", 1, "09:30")];

    expect(resolveOrderTimeLimit(rules, target)).toMatchObject({ daysBefore: 1, time: "09:30" });
    expect(explainOrderTimeLimit(rules, target)?.from).toEqual({ type: "category", id: "gateaux" });
  });

  it("applique la limite d'une famille parente", () => {
    const rules = [family("patisserie", 3, "10:00"), family("gateaux", 2, "12:00")];

    expect(resolveOrderTimeLimit(rules, target)).toMatchObject({ daysBefore: 3, time: "10:00" });
    expect(explainOrderTimeLimit(rules, target)?.from).toEqual({
      type: "category",
      id: "patisserie",
    });
  });

  it("ignore une famille hors de la lignée", () => {
    expect(resolveOrderTimeLimit([family("viennoiserie", 2, "12:00")], target)).toBeNull();
  });

  it("ne vise pas un produit exclu de la famille", () => {
    expect(resolveOrderTimeLimit([family("gateaux", 2, "12:00", ["fraisier"])], target)).toBeNull();
  });

  it("laisse la famille parente viser un produit que seule la famille proche exclut", () => {
    const rules = [family("gateaux", 3, "10:00", ["fraisier"]), family("patisserie", 1, "18:00")];

    expect(resolveOrderTimeLimit(rules, target)).toMatchObject({ daysBefore: 1, time: "18:00" });
  });

  it("à égalité, dit le produit, puis la famille la plus proche", () => {
    const rules = [family("patisserie", 2, "12:00"), family("gateaux", 2, "12:00")];

    expect(explainOrderTimeLimit(rules, target)?.from).toEqual({ type: "category", id: "gateaux" });
    expect(explainOrderTimeLimit([...rules, product(2, "12:00")], target)?.from).toEqual({
      type: "product",
      id: "fraisier",
    });
  });

  it("ignore une règle de famille incomplète", () => {
    const rules = [
      rule({ scope: { type: "category", id: "gateaux" }, daysBefore: 3 }),
      product(1, "18:00"),
    ];

    expect(resolveOrderTimeLimit(rules, target)).toMatchObject({ daysBefore: 1, time: "18:00" });
  });

  it("se lit sans exclusion sur une règle rangée sans la liste", () => {
    const stored: unknown = {
      scope: { type: "category", id: "gateaux" },
      daysBefore: 2,
      time: "12:00",
      graceMinutes: null,
    };

    expect(syncOrderTimeLimitRuleSchema.parse(stored).excludedProductIds).toEqual([]);
  });
});

describe("la case « l'équipe peut passer outre »", () => {
  const TARGET = { variantId: null, productId: "p1", categoryPath: ["pain"] };

  it("est celle de la règle du produit", () => {
    const rules = [
      rule({
        scope: { type: "product", id: "p1" },
        daysBefore: 2,
        time: "12:00",
        staffMayExceed: true,
      }),
    ];

    expect(resolveOrderTimeLimit(rules, TARGET)?.staffMayExceed).toBe(true);
  });

  it("est fausse dès qu'une des règles en jeu l'interdit (famille cochée, produit décoché)", () => {
    const rules = [
      rule({
        scope: { type: "category", id: "pain" },
        daysBefore: 2,
        time: "12:00",
        staffMayExceed: true,
      }),
      rule({ scope: { type: "product", id: "p1" }, daysBefore: 1, time: "18:00" }),
    ];

    expect(resolveOrderTimeLimit(rules, TARGET)?.staffMayExceed).toBe(false);
  });

  it("est vraie quand toutes les règles en jeu la permettent", () => {
    const rules = [
      rule({
        scope: { type: "category", id: "pain" },
        daysBefore: 2,
        time: "12:00",
        staffMayExceed: true,
      }),
      rule({
        scope: { type: "product", id: "p1" },
        daysBefore: 1,
        time: "18:00",
        staffMayExceed: true,
      }),
    ];

    expect(resolveOrderTimeLimit(rules, TARGET)?.staffMayExceed).toBe(true);
  });

  /** Une règle rangée ou émise avant que la case existe dit une limite infranchissable. */
  it("se lit `false` sur une règle d'avant, qui ne la porte pas", () => {
    const stored: unknown = {
      scope: { type: "product", id: "p1" },
      daysBefore: 2,
      time: "12:00",
      graceMinutes: null,
    };

    expect(syncOrderTimeLimitRuleSchema.parse(stored).staffMayExceed).toBe(false);
  });
});
