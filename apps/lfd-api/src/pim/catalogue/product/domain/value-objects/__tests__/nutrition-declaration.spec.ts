import {
  NegativeNutritionValueError,
  NutritionPartExceedsWholeError,
  nutritionDeclaration,
  OverlappingAllergensError,
  UnknownAllergenError,
} from "../nutrition-declaration.js";

/**
 * Les codes que le référentiel reconnaît, **reçus** (D3).
 *
 * Trois suffisent : ce qui se prouve ici est la garde, pas le contenu de la
 * table — l'e2e `pim-allergens` rejoue les trente codes contre la base semée.
 * Le point de la signature est ailleurs : la fabrique reste pure et synchrone,
 * donc éprouvable sans Nest et sans Postgres.
 */
const KNOWN = new Set(["AM", "GB", "UW"]);

/**
 * La fiche nutritionnelle est **valide ou n'existe pas**.
 *
 * Ce que ces règles protègent n'est pas une base de données : c'est un tableau
 * imprimé sur un emballage. Une valeur qu'on laisse passer ici ne provoque
 * aucune erreur — elle se lit à la loupe, sur l'étiquette, par quelqu'un qui a
 * une bonne raison de la croire.
 */
describe("nutritionDeclaration", () => {
  it("accepte une fiche vide — « aucun allergène » est une déclaration", () => {
    const fiche = nutritionDeclaration([], [], {}, KNOWN);
    expect(fiche.allergens).toEqual([]);
    expect(fiche.mayContain).toEqual([]);
  });

  it("refuse un code hors référentiel", () => {
    expect(() => nutritionDeclaration(["ZZ"], [], {}, KNOWN)).toThrow(UnknownAllergenError);
  });

  /**
   * La liste vient du HANDLER, jamais d'une constante compilée : c'est tout
   * l'objet de D3. Un code que ce référentiel-ci ignore est refusé même s'il
   * existait dans l'ancienne table en dur.
   */
  it("ne connaît que les codes qu'on lui passe", () => {
    expect(() => nutritionDeclaration(["SH"], [], {}, KNOWN)).toThrow(UnknownAllergenError);
    expect(nutritionDeclaration(["SH"], [], {}, new Set(["SH"])).allergens).toEqual(["SH"]);
  });

  /** `may_contain` suit le MÊME référentiel — il n'a pas de garde à lui. */
  it("valide les traces contre le même référentiel que les présents", () => {
    expect(() => nutritionDeclaration([], ["ZZ"], {}, KNOWN)).toThrow(UnknownAllergenError);
  });

  it("dédoublonne les deux listes", () => {
    const fiche = nutritionDeclaration(["AM", "AM"], ["GB", "GB"], {}, KNOWN);

    expect(fiche.allergens).toEqual(["AM"]);
    expect(fiche.mayContain).toEqual(["GB"]);
  });

  it("refuse un allergène à la fois présent et en trace", () => {
    expect(() => nutritionDeclaration(["AM"], ["AM"], {}, KNOWN)).toThrow(
      OverlappingAllergensError,
    );
  });

  it("refuse une valeur négative", () => {
    expect(() => nutritionDeclaration([], [], { saltG: -1 }, KNOWN)).toThrow(
      NegativeNutritionValueError,
    );
  });

  describe("les « dont » sont des PARTS", () => {
    it("refuse des acides gras saturés au-dessus des matières grasses", () => {
      expect(() => nutritionDeclaration([], [], { fatG: 4, saturatedFatG: 12 }, KNOWN)).toThrow(
        NutritionPartExceedsWholeError,
      );
    });

    it("refuse des sucres au-dessus des glucides", () => {
      expect(() => nutritionDeclaration([], [], { carbsG: 4, sugarsG: 12 }, KNOWN)).toThrow(
        NutritionPartExceedsWholeError,
      );
    });

    it("accepte la part ÉGALE au tout — un sirop est tout en sucres", () => {
      expect(() => nutritionDeclaration([], [], { carbsG: 80, sugarsG: 80 }, KNOWN)).not.toThrow();
    });

    it("ne dit RIEN quand le tout n'est pas renseigné", () => {
      // On ne connaît pas encore la borne. Refuser ici bloquerait une fiche à
      // moitié remplie, qui est l'état normal d'une saisie en cours.
      expect(() => nutritionDeclaration([], [], { sugarsG: 12 }, KNOWN)).not.toThrow();
    });
  });
});
