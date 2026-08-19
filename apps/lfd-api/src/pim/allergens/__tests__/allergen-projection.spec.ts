import { toGdsn, toInco, UnknownAllergenCodeError } from "../allergen-projection.js";

describe("toInco (projection GS1 → INCO)", () => {
  it("déduplique n:1 — deux codes GS1 gluten → une seule catégorie", () => {
    const inco = toInco(["AW", "AR"], "fr"); // blé + seigle
    expect(inco).toHaveLength(1);
    expect(inco[0]?.category).toBe("gluten");
    expect(inco[0]?.label).toBe("Céréales contenant du gluten");
  });

  it("filtre les codes sans obligation UE", () => {
    expect(toInco(["UN"], "fr")).toEqual([]);
    expect(toInco(["AM", "UN"], "fr").map((a) => a.category)).toEqual(["milk"]);
  });

  it("localise le libellé de catégorie", () => {
    expect(toInco(["AM"], "fr")[0]?.label).toBe("Lait");
    expect(toInco(["AM"], "en")[0]?.label).toBe("Milk");
  });

  it("marque la mise en forme (emphasize) exigée par l’INCO", () => {
    expect(toInco(["AE"], "fr")[0]?.emphasize).toBe(true);
  });

  it("préserve l’ordre de première apparition des catégories", () => {
    const codes = ["AM", "AW", "AP"]; // lait, gluten, arachide
    expect(toInco(codes, "fr").map((a) => a.category)).toEqual(["milk", "gluten", "peanuts"]);
  });

  it("lève UnknownAllergenCodeError sur un code inconnu", () => {
    expect(() => toInco(["ZZ"], "fr")).toThrow(UnknownAllergenCodeError);
  });

  it("sur un ensemble vide → aucune catégorie", () => {
    expect(toInco([], "fr")).toEqual([]);
  });
});

describe("toGdsn (pass-through GS1 pour le B2B)", () => {
  it("renvoie les codes GS1 canoniques tels quels", () => {
    expect(toGdsn(["AW", "AM", "UN"])).toEqual(["AW", "AM", "UN"]);
  });

  it("valide chaque code contre le référentiel", () => {
    expect(() => toGdsn(["AW", "ZZ"])).toThrow(UnknownAllergenCodeError);
  });
});
