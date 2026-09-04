import type { OrderTimeLimitScopeType, OrderTimeLimitView } from "@lfd/pim-contracts";

import { resolveOrderTimeLimit, type LimitTarget } from "../resolve-order-time-limit.js";

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

describe("resolveOrderTimeLimit", () => {
  it("ne rend rien quand aucune règle n'existe", () => {
    expect(resolveOrderTimeLimit([], ENTREMETS)).toBeNull();
  });

  it("prend le global quand lui seul se prononce", () => {
    const rules = [rule("global", null, { daysBefore: 1, time: "18:00" })];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: 1,
      time: "18:00",
      graceMinutes: 0,
    });
  });

  /**
   * **Le cœur de la conception.** « Le pain ferme à 16 h » ne recopie pas le
   * nombre de jours ; « l'entremets demande un jour de plus » ne recopie pas
   * l'heure. Le jour où le labo passe de 18 h à 16 h, tout ce qui n'a pas
   * d'heure propre suit.
   */
  it("hérite CHAMP PAR CHAMP : un rang pose ce qu'il change, et rien d'autre", () => {
    const rules = [
      rule("global", null, { daysBefore: 1, time: "18:00", graceMinutes: 30 }),
      // La famille change l'heure, pas les jours.
      rule("category", "patisserie", { time: "16:00" }),
      // Le produit change les jours, pas l'heure.
      rule("product", "p1", { daysBefore: 2 }),
    ];

    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: 2, // du produit
      time: "16:00", // de la famille
      graceMinutes: 30, // du global
    });
  });

  it("laisse la déclinaison l'emporter sur le produit", () => {
    const rules = [
      rule("global", null, { daysBefore: 1, time: "18:00" }),
      rule("product", "p1", { daysBefore: 2 }),
      // Le seau de 5 kg demande encore plus de préavis que le produit.
      rule("variant", "v1", { daysBefore: 3 }),
    ];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)?.daysBefore).toBe(3);
  });

  /**
   * La remontée d'arbre s'arrête au **plus proche ancêtre qui se prononce**.
   * Aller directement à la racine ferait ignorer la famille la plus précise, et
   * le réglage le plus soigneusement posé serait celui qu'on n'appliquerait pas.
   */
  it("remonte l'arbre des familles, du plus proche au plus lointain", () => {
    const rules = [
      rule("global", null, { daysBefore: 1, time: "18:00" }),
      rule("category", "sucre", { time: "14:00" }),
      rule("category", "patisserie", { time: "16:00" }),
    ];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)?.time).toBe("16:00");
  });

  it("se rabat sur l'ancêtre suivant quand le plus proche ne dit rien du champ", () => {
    const rules = [
      rule("global", null, { daysBefore: 1, time: "18:00" }),
      rule("category", "sucre", { daysBefore: 4 }),
      // La pâtisserie ne parle que de l'heure : les jours viennent de « sucré ».
      rule("category", "patisserie", { time: "16:00" }),
    ];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: 4,
      time: "16:00",
      graceMinutes: 0,
    });
  });

  it("ignore les règles qui visent un autre article", () => {
    const rules = [
      rule("global", null, { daysBefore: 1, time: "18:00" }),
      rule("product", "AUTRE", { daysBefore: 9 }),
      rule("category", "viennoiserie", { time: "05:00" }),
      rule("variant", "AUTRE-V", { daysBefore: 9 }),
    ];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toEqual({
      daysBefore: 1,
      time: "18:00",
      graceMinutes: 0,
    });
  });

  /**
   * Une limite n'existe QUE si le jour et l'heure sont tous deux résolus.
   * Inventer « la veille à 18 h » ferait refuser des commandes au nom d'une
   * règle que personne n'a écrite — le contraire de ce que le référentiel doit
   * garantir.
   */
  it("ne rend rien quand l'heure manque, même si les jours sont posés", () => {
    const rules = [rule("global", null, { daysBefore: 2 })];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });

  it("ne rend rien quand les jours manquent, même si l'heure est posée", () => {
    const rules = [rule("global", null, { time: "18:00" })];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)).toBeNull();
  });

  /**
   * Le rattrapage, lui, a un défaut honnête : ne rien déclarer veut dire « la
   * limite est ferme », pas « on ne sait pas ». C'est la seule des trois valeurs
   * dont l'absence a un sens univoque.
   */
  it("rend une grâce de 0 quand personne ne la déclare", () => {
    const rules = [rule("global", null, { daysBefore: 1, time: "18:00" })];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)?.graceMinutes).toBe(0);
  });

  it("laisse un rang poser une grâce nulle EXPLICITE sous un global généreux", () => {
    const rules = [
      rule("global", null, { daysBefore: 1, time: "18:00", graceMinutes: 60 }),
      // Les entremets ne se rattrapent pas : la production est lancée.
      rule("product", "p1", { graceMinutes: 0 }),
    ];
    expect(resolveOrderTimeLimit(rules, ENTREMETS)?.graceMinutes).toBe(0);
  });

  it("ne cherche pas de déclinaison quand l'article n'en a pas", () => {
    const sansDeclinaison: LimitTarget = { ...ENTREMETS, variantId: null };
    const rules = [
      rule("global", null, { daysBefore: 1, time: "18:00" }),
      // Porte le MÊME identifiant que le produit : si la portée était ignorée,
      // cette règle-ci s'appliquerait quand même.
      rule("variant", "p1", { daysBefore: 9 }),
    ];
    expect(resolveOrderTimeLimit(rules, sansDeclinaison)?.daysBefore).toBe(1);
  });

  it("accepte un article sans aucune famille", () => {
    const orphelin: LimitTarget = { variantId: null, productId: "p1", categoryPath: [] };
    const rules = [rule("global", null, { daysBefore: 1, time: "18:00" })];
    expect(resolveOrderTimeLimit(rules, orphelin)?.daysBefore).toBe(1);
  });
});
