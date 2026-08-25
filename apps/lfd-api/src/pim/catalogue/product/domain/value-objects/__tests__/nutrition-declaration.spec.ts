import {
  NegativeNutritionValueError,
  NutritionPartExceedsWholeError,
  nutritionDeclaration,
  OverlappingAllergensError,
  UnknownAllergenError,
} from "../nutrition-declaration.js";

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
    const fiche = nutritionDeclaration([], [], {});
    expect(fiche.allergens).toEqual([]);
    expect(fiche.mayContain).toEqual([]);
  });

  it("refuse un code hors référentiel", () => {
    expect(() => nutritionDeclaration(["ZZ"], [], {})).toThrow(UnknownAllergenError);
  });

  it("refuse un allergène à la fois présent et en trace", () => {
    expect(() => nutritionDeclaration(["AM"], ["AM"], {})).toThrow(OverlappingAllergensError);
  });

  it("refuse une valeur négative", () => {
    expect(() => nutritionDeclaration([], [], { saltG: -1 })).toThrow(NegativeNutritionValueError);
  });

  describe("les « dont » sont des PARTS", () => {
    it("refuse des acides gras saturés au-dessus des matières grasses", () => {
      expect(() => nutritionDeclaration([], [], { fatG: 4, saturatedFatG: 12 })).toThrow(
        NutritionPartExceedsWholeError,
      );
    });

    it("refuse des sucres au-dessus des glucides", () => {
      expect(() => nutritionDeclaration([], [], { carbsG: 4, sugarsG: 12 })).toThrow(
        NutritionPartExceedsWholeError,
      );
    });

    it("accepte la part ÉGALE au tout — un sirop est tout en sucres", () => {
      expect(() => nutritionDeclaration([], [], { carbsG: 80, sugarsG: 80 })).not.toThrow();
    });

    it("ne dit RIEN quand le tout n'est pas renseigné", () => {
      // On ne connaît pas encore la borne. Refuser ici bloquerait une fiche à
      // moitié remplie, qui est l'état normal d'une saisie en cours.
      expect(() => nutritionDeclaration([], [], { sugarsG: 12 })).not.toThrow();
    });
  });
});
