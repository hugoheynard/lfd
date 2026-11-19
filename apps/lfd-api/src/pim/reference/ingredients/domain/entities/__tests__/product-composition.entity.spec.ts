import {
  IngredientArchivedError,
  IngredientNotFoundError,
} from "../../errors/ingredient-errors.js";
import { ProductComposition, type CitableIngredient } from "../product-composition.entity.js";

const REFERENTIAL = new Map<string, CitableIngredient>([
  ["beurre", { name: "Beurre", archived: false }],
  ["farine", { name: "Farine", archived: false }],
  ["sel-gris", { name: "Sel gris", archived: true }],
]);

describe("ProductComposition", () => {
  it("remplace la liste dans l'ordre reçu et rend les ingrédients nommés", () => {
    const composition = ProductComposition.rehydrate("prd_1", ["beurre"]);

    const named = composition.replace(["farine", "beurre"], REFERENTIAL);

    expect(composition.keys).toEqual(["farine", "beurre"]);
    expect(named).toEqual([
      { id: "farine", name: "Farine" },
      { id: "beurre", name: "Beurre" },
    ]);
  });

  it("écarte une redite plutôt que de citer deux fois le même ingrédient", () => {
    const composition = ProductComposition.rehydrate("prd_1", []);

    composition.replace(["beurre", "farine", "beurre"], REFERENTIAL);

    expect(composition.keys).toEqual(["beurre", "farine"]);
  });

  it("refuse une clé que le référentiel ignore, sans toucher la liste", () => {
    const composition = ProductComposition.rehydrate("prd_1", ["beurre"]);

    expect(() => composition.replace(["beurre", "inconnu"], REFERENTIAL)).toThrow(
      IngredientNotFoundError,
    );
    expect(composition.keys).toEqual(["beurre"]);
  });

  it("refuse d'ajouter un ingrédient archivé que la fiche ne citait pas", () => {
    const composition = ProductComposition.rehydrate("prd_1", ["beurre"]);

    expect(() => composition.replace(["beurre", "sel-gris"], REFERENTIAL)).toThrow(
      IngredientArchivedError,
    );
  });

  it("garde un ingrédient archivé que la fiche citait déjà, même réordonné", () => {
    const composition = ProductComposition.rehydrate("prd_1", ["sel-gris", "beurre"]);

    composition.replace(["beurre", "sel-gris"], REFERENTIAL);

    expect(composition.keys).toEqual(["beurre", "sel-gris"]);
  });

  it("dit qu'elle cite déjà une liste identique, ordre compris, redite écartée", () => {
    const composition = ProductComposition.rehydrate("prd_1", ["beurre", "farine"]);

    expect(composition.cites(["beurre", "farine"])).toBe(true);
    expect(composition.cites(["beurre", "farine", "beurre"])).toBe(true);
    expect(composition.cites(["farine", "beurre"])).toBe(false);
    expect(composition.cites(["beurre"])).toBe(false);
  });

  it("copie ce que l'origine citait sur la fiche née d'elle, archivés compris", () => {
    const origin = ProductComposition.rehydrate("prd_1", ["sel-gris", "beurre"]);

    const born = ProductComposition.copiedFrom(origin, "prd_2");

    expect(born.productId).toBe("prd_2");
    expect(born.keys).toEqual(["sel-gris", "beurre"]);
  });
});
