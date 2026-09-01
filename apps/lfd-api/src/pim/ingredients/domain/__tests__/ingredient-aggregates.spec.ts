import { AppellationAggregate } from "../entities/appellation.entity.js";
import { IngredientAggregate } from "../entities/ingredient.entity.js";
import {
  LocalizedNameRequiredError,
  ReferenceKeyInvalidError,
} from "../errors/ingredient-errors.js";

describe("AppellationAggregate", () => {
  it("nettoie le code avant de le figer", () => {
    const appellation = AppellationAggregate.open({
      id: "id_1",
      code: "  aop-beaufort  ",
      label: { fr: "Beaufort" },
      scheme: " AOP ",
      active: true,
    });

    expect(appellation.snapshot().code).toBe("aop-beaufort");
    expect(appellation.snapshot().scheme).toBe("AOP");
  });

  // Le code est cité par clé étrangère : une forme libre y ferait entrer des
  // espaces et des majuscules, donc deux écritures du même signe.
  it("refuse un code qui n'est pas une identité", () => {
    expect(() =>
      AppellationAggregate.open({
        id: "id_1",
        code: "AOP Beaufort",
        label: { fr: "Beaufort" },
        scheme: "AOP",
        active: true,
      }),
    ).toThrow(ReferenceKeyInvalidError);
  });

  // Un badge sans libellé serait une affirmation réglementée illisible.
  it("exige un libellé dans la langue source", () => {
    expect(() =>
      AppellationAggregate.open({
        id: "id_1",
        code: "igp",
        label: { fr: "   " },
        scheme: "IGP",
        active: true,
      }),
    ).toThrow(LocalizedNameRequiredError);
  });

  it("règle ce qui est réglable et laisse le code intact", () => {
    const appellation = AppellationAggregate.open({
      id: "id_1",
      code: "aop-beaufort",
      label: { fr: "Beaufort" },
      scheme: "AOP",
      active: true,
    });

    appellation.revise({ label: { fr: "Beaufort", it: "Beaufort" }, active: false });

    expect(appellation.snapshot()).toMatchObject({
      code: "aop-beaufort",
      label: { fr: "Beaufort", it: "Beaufort" },
      active: false,
    });
  });
});

describe("IngredientAggregate", () => {
  const base = {
    id: "id_1",
    key: "beurre-de-savoie",
    name: { fr: "Beurre de Savoie" },
    description: null,
    origin: " Savoie, France ",
    appellationId: null,
  };

  it("nettoie la clé et l'origine", () => {
    const ingredient = IngredientAggregate.declare(base);

    expect(ingredient.snapshot().key).toBe("beurre-de-savoie");
    expect(ingredient.snapshot().origin).toBe("Savoie, France");
  });

  // Une locale vidée doit DISPARAÎTRE : gardée en chaîne vide, elle serait
  // comptée comme une traduction par tout ce qui compte les langues remplies.
  it("retire une traduction vidée plutôt que d'y laisser du vide", () => {
    const ingredient = IngredientAggregate.declare(base);

    ingredient.revise({ name: { fr: "Beurre", en: "  ", it: "Burro" } });

    expect(ingredient.snapshot().name).toEqual({ fr: "Beurre", it: "Burro" });
  });

  it("ramène une description entièrement vide à une absence", () => {
    const ingredient = IngredientAggregate.declare({
      ...base,
      description: { fr: "   " },
    });

    expect(ingredient.snapshot().description).toBeNull();
  });

  // Les trois états de l'appellation : ne pas toucher, retirer, poser.
  it("distingue « ne touche pas » de « retire le signe »", () => {
    const ingredient = IngredientAggregate.declare({ ...base, appellationId: "app_1" });

    ingredient.revise({ origin: "Savoie" });
    expect(ingredient.snapshot().appellationId).toBe("app_1");

    ingredient.revise({ appellationId: null });
    expect(ingredient.snapshot().appellationId).toBeNull();
  });

  describe("les allergènes qu'elle contient", () => {
    it("ne prétend rien contenir tant que personne ne l'a dit", () => {
      expect(IngredientAggregate.declare(base).snapshot().allergens).toEqual([]);
    });

    // Un ensemble, pas une suite : un code cité deux fois est une redite, et
    // l'ordre de saisie n'est porteur de rien.
    it("déduplique et range les codes reçus", () => {
      const ingredient = IngredientAggregate.declare(base);

      ingredient.declareAllergens(["SH", "AC", "SH", "BWD"]);

      expect(ingredient.snapshot().allergens).toEqual(["AC", "BWD", "SH"]);
    });

    it("remplace la liste précédente plutôt que de la compléter", () => {
      const ingredient = IngredientAggregate.declare(base);
      ingredient.declareAllergens(["SH", "AC"]);

      ingredient.declareAllergens(["UW"]);

      expect(ingredient.snapshot().allergens).toEqual(["UW"]);
    });

    // Régler le nom d'une matière ne touche pas à ce qu'elle contient : les
    // deux gestes sont deux sections de l'écran et deux faits au journal.
    it("survit à une révision d'identité", () => {
      const ingredient = IngredientAggregate.declare(base);
      ingredient.declareAllergens(["SH"]);

      ingredient.revise({ origin: "Savoie", appellationId: "app_1" });

      expect(ingredient.snapshot().allergens).toEqual(["SH"]);
    });

    // Une base relue par un autre chemin (import, psql) peut rendre des
    // doublons ou un ordre quelconque : l'ensemble canonique est un invariant
    // de l'agrégat, pas une politesse de l'adaptateur.
    it("range aussi ce qu'elle relit", () => {
      const ingredient = IngredientAggregate.rehydrate({
        ...base,
        key: "praline",
        origin: "Savoie",
        allergens: ["SH", "AC", "SH"],
      });

      expect(ingredient.snapshot().allergens).toEqual(["AC", "SH"]);
    });
  });
});
