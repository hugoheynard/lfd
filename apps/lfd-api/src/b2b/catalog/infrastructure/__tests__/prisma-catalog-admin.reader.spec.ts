import { allergensOf } from "../prisma-catalog-admin.reader.js";

/**
 * Les trois états de la fiche réglementaire, tels que l'écran catalogue les
 * lit. Le premier n'est pas le second, et c'est la seule faute qui compte sur
 * ce champ : confondre « personne n'a rien saisi » avec « il a été vérifié
 * qu'il n'y en a aucun » transforme un oubli en promesse au consommateur.
 */
describe("allergensOf — les trois états", () => {
  it("rend null quand aucune fiche n'est déclarée", () => {
    expect(allergensOf(null)).toEqual({ allergens: null, allergensIncomplete: false });
    expect(allergensOf(undefined)).toEqual({ allergens: null, allergensIncomplete: false });
  });

  it("rend une liste vide COMPLÈTE pour une fiche déclarée sans allergène", () => {
    expect(allergensOf([])).toEqual({ allergens: [], allergensIncomplete: false });
  });

  it("projette les codes vers leur catégorie d'étiquette", () => {
    expect(allergensOf(["SH"])).toEqual({
      allergens: [{ category: "tree_nuts", label: "Fruits à coque" }],
      allergensIncomplete: false,
    });
  });

  it("dédoublonne le n:1 — sept céréales ne font qu'une mention", () => {
    const { allergens } = allergensOf(["UW", "NR", "GB"]);

    expect(allergens).toEqual([{ category: "gluten", label: "Céréales contenant du gluten" }]);
  });
});

describe("allergensOf — la liste amputée", () => {
  /**
   * Régression : `allergensIncomplete` ne comptait que les codes INCONNUS. Un
   * code connu mais SANS obligation UE — sarrasin, maïs, noix de coco — est
   * écarté par la projection INCO tout aussi silencieusement, et la fiche
   * rendue était `[]` avec le drapeau à faux. L'écran affichait alors « Sans
   * allergène » sur un article qui déclarait la noix de coco, sur une surface
   * en service depuis le 2026-08-17 (fix 2026-08-31).
   */
  it("signale la fiche incomplète quand le seul code déclaré est hors obligation UE", () => {
    expect(allergensOf(["SO"])).toEqual({ allergens: [], allergensIncomplete: true });
  });

  it("signale les trois codes hors UE du référentiel, pas seulement la noix de coco", () => {
    for (const code of ["SO", "BWD", "NM"]) {
      expect(allergensOf([code])).toEqual({ allergens: [], allergensIncomplete: true });
    }
  });

  it("signale la fiche incomplète quand un code est inconnu du référentiel", () => {
    expect(allergensOf(["ZZZZ"])).toEqual({ allergens: [], allergensIncomplete: true });
  });

  /**
   * Le cas qui trompe le plus : la liste n'est PAS vide, elle a l'air entière,
   * et il lui manque pourtant une déclaration.
   */
  it("signale l'amputation même quand la liste rendue n'est pas vide", () => {
    expect(allergensOf(["SH", "SO"])).toEqual({
      allergens: [{ category: "tree_nuts", label: "Fruits à coque" }],
      allergensIncomplete: true,
    });
  });

  it("ignore ce qui n'est pas une chaîne sans le compter comme une déclaration", () => {
    expect(allergensOf(["SH", 42, null])).toEqual({
      allergens: [{ category: "tree_nuts", label: "Fruits à coque" }],
      allergensIncomplete: false,
    });
  });
});
