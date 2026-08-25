import { ALLERGEN_MAPPINGS, findMapping, type IncoCategory } from "../allergen-mapping.js";
import { toGdsn, toInco, UnknownAllergenCodeError } from "../allergen-projection.js";

describe("toInco (projection GS1 → INCO)", () => {
  it("déduplique n:1 — deux céréales → une seule catégorie", () => {
    const inco = toInco(["UW", "NR"], "fr"); // blé + seigle
    expect(inco).toHaveLength(1);
    expect(inco[0]?.category).toBe("gluten");
    expect(inco[0]?.label).toBe("Céréales contenant du gluten");
  });

  it("filtre les codes sans obligation UE", () => {
    expect(toInco(["BWD"], "fr")).toEqual([]); // sarrasin : hors annexe II
    expect(toInco(["AM", "BWD"], "fr").map((a) => a.category)).toEqual(["milk"]);
  });

  it("localise le libellé de catégorie", () => {
    expect(toInco(["AM"], "fr")[0]?.label).toBe("Lait");
    expect(toInco(["AM"], "en")[0]?.label).toBe("Milk");
  });

  it("marque la mise en forme (emphasize) exigée par l’INCO", () => {
    expect(toInco(["AE"], "fr")[0]?.emphasize).toBe(true);
  });

  it("préserve l’ordre de première apparition des catégories", () => {
    const codes = ["AM", "UW", "AP"]; // lait, blé, arachide
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
    expect(toGdsn(["UW", "AM", "BWD"])).toEqual(["UW", "AM", "BWD"]);
  });

  it("valide chaque code contre le référentiel", () => {
    expect(() => toGdsn(["UW", "ZZ"])).toThrow(UnknownAllergenCodeError);
  });
});

/**
 * Le référentiel lui-même. Ce qu'un test protège ici n'est pas un calcul, c'est
 * une **donnée réglementée** : elle se relit une fois, à la main, contre la
 * source — et ensuite plus personne ne la relit. Ces vérifications sont ce qui
 * remplace la relecture.
 */
describe("le référentiel", () => {
  const ANNEXE_II: readonly IncoCategory[] = [
    "gluten",
    "crustaceans",
    "eggs",
    "fish",
    "peanuts",
    "soybeans",
    "milk",
    "tree_nuts",
    "celery",
    "mustard",
    "sesame",
    "sulphites",
    "lupin",
    "molluscs",
  ];

  it("couvre les QUATORZE catégories de l’annexe II, sans exception", () => {
    const covered = new Set(
      ALLERGEN_MAPPINGS.map((m) => m.incoCategory).filter((c): c is IncoCategory => c !== null),
    );
    expect([...covered].sort()).toEqual([...ANNEXE_II].sort());
  });

  it("nomme les céréales et les fruits à coque, jamais leur catégorie", () => {
    // L'annexe II impose « à savoir blé, seigle, orge, avoine » et « à savoir
    // amandes, noisettes, noix… ». Les codes GÉNÉRIQUES de GS1 permettraient de
    // déclarer « fruits à coque » sans dire lesquels — donc d'imprimer une
    // étiquette non conforme depuis une saisie qui a l'air complète.
    expect(findMapping("AW")).toBeUndefined(); // Cereals (générique)
    expect(findMapping("AN")).toBeUndefined(); // Tree nuts (générique)
    expect(ALLERGEN_MAPPINGS.filter((m) => m.incoCategory === "tree_nuts")).toHaveLength(8);
    expect(ALLERGEN_MAPPINGS.filter((m) => m.incoCategory === "gluten")).toHaveLength(6);
  });

  it("écarte le code qui chevauche deux catégories", () => {
    // `UN` (Shellfish) couvre crustacés ET mollusques : aucune projection INCO
    // ne peut être juste. L'ancien référentiel s'en servait pour dire « hors
    // obligation UE », ce qui était faux deux fois.
    expect(findMapping("UN")).toBeUndefined();
  });

  it("n’a aucun code en double", () => {
    const codes = ALLERGEN_MAPPINGS.map((m) => m.gs1Code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("n’a plus aucun code provisoire", () => {
    expect(ALLERGEN_MAPPINGS.filter((m) => m.gs1Code.startsWith("TBD_"))).toEqual([]);
  });
});
