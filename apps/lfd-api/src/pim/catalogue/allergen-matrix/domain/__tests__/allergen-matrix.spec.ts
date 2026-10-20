import { CategoryNotFoundError } from "../../../category/domain/errors/category-errors.js";
import { allergenMatrixCsv } from "../allergen-matrix-csv.js";
import { buildAllergenMatrix, type MatrixFilters, type MatrixRow } from "../allergen-matrix.js";
import {
  FAMILY_ID,
  OTHER_FAMILY_ID,
  SUB_FAMILY_ID,
  families,
  product,
  referential,
  variant,
} from "./matrix-fixtures.js";
import type { ProductRecord } from "../../../product/domain/ports/product.repository.js";

/**
 * La matrice des allergènes, **sans Nest et sans base** (plan AM1). Ce qu'elle
 * protège : une case vide ne se lit jamais comme une absence qu'on n'a pas
 * vérifiée.
 */

const DEFAULTS: MatrixFilters = {
  locale: "fr",
  scope: "published",
  categoryId: null,
  includeUndeclared: true,
};

function build(products: readonly ProductRecord[], filters: Partial<MatrixFilters> = {}) {
  return buildAllergenMatrix({
    referential: referential(),
    products,
    families: families(),
    filters: { ...DEFAULTS, ...filters },
  });
}

function rowsOf(products: readonly ProductRecord[], filters: Partial<MatrixFilters> = {}) {
  return build(products, filters).families.flatMap((family) => family.rows);
}

function onlyRow(products: readonly ProductRecord[]): MatrixRow {
  const [row] = rowsOf(products);
  if (row === undefined) {
    throw new Error("la matrice n'a rendu aucune ligne");
  }
  return row;
}

function cell(row: MatrixRow, category: string) {
  return row.cells.find((candidate) => candidate.category === category);
}

function declaring(declared: readonly string[], mayContain: readonly string[] = []) {
  return product("p", { variants: [variant("p_v1", { allergenSheet: { declared, mayContain } })] });
}

describe("buildAllergenMatrix — les colonnes", () => {
  it("rend les catégories de l'annexe II du référentiel, dans son ordre", () => {
    expect(build([]).columns).toEqual([
      { category: "gluten", label: "Céréales contenant du gluten" },
      { category: "milk", label: "Lait" },
      { category: "tree_nuts", label: "Fruits à coque" },
    ]);
  });

  it("parle italien, et dit qu'aucune mention ne manque", () => {
    const matrix = build([], { locale: "it" });
    expect(matrix.columns.map((column) => column.label)).toEqual([
      "Cereali contenenti glutine",
      "Latte",
      "Frutta a guscio",
    ]);
    expect(matrix.mentionsTranslated).toBe(true);
  });

  it("retombe sur le français quand une mention manque, et le dit", () => {
    const matrix = build([], { locale: "en" });
    // Les libellés de fixture n'ont pas d'anglais pour les précisions.
    expect(matrix.mentionsTranslated).toBe(false);
  });
});

describe("buildAllergenMatrix — trois états, jamais deux", () => {
  it("non renseigné n'est pas « aucun » : pas de case du tout", () => {
    const row = onlyRow([product("p")]);
    expect(row.state).toBe("not_declared");
    expect(row.cells).toEqual([]);
    expect(row.others).toBeNull();
  });

  it("« aucun » est une affirmation : des cases, toutes absentes", () => {
    const row = onlyRow([declaring([])]);
    expect(row.state).toBe("none_declared");
    expect(row.cells.map((c) => c.presence)).toEqual(["absent", "absent", "absent"]);
  });

  it("une trace n'est pas une présence", () => {
    const row = onlyRow([declaring([], ["ML"])]);
    expect(row.state).toBe("declared");
    expect(cell(row, "milk")?.presence).toBe("traces");
  });

  it("contenir l'emporte sur une trace d'une autre céréale, et les deux se nomment", () => {
    const row = onlyRow([declaring(["UW"], ["NR"])]);
    expect(cell(row, "gluten")).toEqual({
      category: "gluten",
      presence: "contains",
      contains: ["Blé"],
      traces: ["Seigle"],
    });
  });

  it("ne nomme que la céréale et le fruit à coque", () => {
    const row = onlyRow([declaring(["ML", "SA"])]);
    expect(cell(row, "milk")).toEqual({
      category: "milk",
      presence: "contains",
      contains: [],
      traces: [],
    });
    expect(cell(row, "tree_nuts")?.contains).toEqual(["Amandes"]);
  });

  /** Q3 l'emporte sur la première rédaction du §1 (Hugo, 2026-10-20). */
  it("le sarrasin se nomme dans « Autres », code compris, et ne rend pas la ligne « à revoir »", () => {
    const row = onlyRow([declaring(["BWD"])]);
    expect(row.state).toBe("declared");
    expect(row.cells.map((c) => c.presence)).toEqual(["absent", "absent", "absent"]);
    expect(row.others).toEqual({
      presence: "contains",
      contains: [{ code: "BWD", label: "Sarrasin", official: true }],
      traces: [],
    });
  });

  it("une entrée maison se nomme dans « Autres », en traces, sans être officielle", () => {
    const row = onlyRow([declaring([], ["PERSO"])]);
    expect(row.state).toBe("declared");
    expect(row.others).toEqual({
      presence: "traces",
      contains: [],
      traces: [{ code: "PERSO", label: "Lupin doux", official: false }],
    });
  });

  it("un code inconnu rend la ligne « à revoir »", () => {
    const row = onlyRow([declaring(["INCONNU"])]);
    expect(row.state).toBe("to_review");
    expect(row.cells).toHaveLength(3);
    expect(row.others?.presence).toBe("absent");
  });

  it("un code d'une catégorie archivée n'a pas de colonne et rend la ligne « à revoir »", () => {
    const row = onlyRow([declaring(["MAISON"])]);
    expect(row.state).toBe("to_review");
    expect(row.cells.map((c) => c.category)).not.toContain("MAISON");
    expect(row.others?.contains).toEqual([]);
  });

  it("un code inconnu dans les traces suffit à rendre la ligne « à revoir »", () => {
    expect(onlyRow([declaring([], ["INCONNU"])]).state).toBe("to_review");
  });
});

describe("buildAllergenMatrix — les déclinaisons", () => {
  it("une déclinaison alignée porte la déclaration du défaut, pas « non renseigné »", () => {
    const aligned = product("p", {
      variants: [
        variant("p_v1", { allergenSheet: { declared: ["UW"], mayContain: [] } }),
        variant("p_v2", { isDefault: false, position: 1, regulatoryFollowsDefault: true }),
      ],
    });
    const rows = rowsOf([aligned]);
    expect(rows.map((row) => [row.variantId, row.state])).toEqual([
      ["p_v1", "declared"],
      ["p_v2", "declared"],
    ]);
    expect(rows[1]?.variantName).toBe("Déclinaison p_v2");
  });

  /** Décision de Hugo, 2026-10-20 (Q5) : une déclinaison arrêtée ne se vend plus. */
  it("écarte une déclinaison arrêtée", () => {
    const withStopped = product("p", {
      variants: [
        variant("p_v1", { allergenSheet: { declared: [], mayContain: [] } }),
        variant("p_v2", { isDefault: false, position: 1, isDiscontinued: true }),
      ],
    });
    expect(rowsOf([withStopped]).map((row) => row.variantId)).toEqual(["p_v1"]);
  });

  it("une seule déclinaison : pas de nom de déclinaison", () => {
    expect(onlyRow([declaring([])]).variantName).toBeNull();
  });
});

describe("buildAllergenMatrix — le périmètre et les filtres", () => {
  const draft = product("brouillon", { status: "draft" });
  const published = declaring([]);

  it("ne retient que les publiés par défaut, brouillons compris sur demande", () => {
    expect(rowsOf([draft, published]).map((r) => r.productId)).toEqual(["p"]);
    expect(rowsOf([draft, published], { scope: "all" })).toHaveLength(2);
  });

  it("n'inclut jamais un archivé, même sur « tous »", () => {
    expect(rowsOf([product("a", { status: "archived" })], { scope: "all" })).toEqual([]);
  });

  it("écarte les non renseignés sur demande", () => {
    expect(rowsOf([product("vide"), published], { includeUndeclared: false })).toHaveLength(1);
  });

  it("filtre une famille, et range les familles par leur rang", () => {
    const pain = product("pain", { categoryId: OTHER_FAMILY_ID });
    expect(build([pain, published]).families.map((f) => f.id)).toEqual([
      FAMILY_ID,
      OTHER_FAMILY_ID,
    ]);
    expect(
      build([pain, published], { categoryId: OTHER_FAMILY_ID }).families.map((f) => f.id),
    ).toEqual([OTHER_FAMILY_ID]);
  });

  it("le filtre d'une famille retient ses sous-familles", () => {
    const special = product("special", { categoryId: SUB_FAMILY_ID });
    const ids = build([special, published], { categoryId: OTHER_FAMILY_ID }).families.map(
      (f) => f.id,
    );
    expect(ids).toEqual([SUB_FAMILY_ID]);
  });

  it("refuse une famille inconnue", () => {
    expect(() => build([], { categoryId: "cat_inconnue" })).toThrow(CategoryNotFoundError);
  });
});

describe("allergenMatrixCsv", () => {
  const BOM = "\uFEFF";

  function linesOf(csv: string): string[] {
    return csv.slice(BOM.length).trimEnd().split("\r\n");
  }

  it("écrit l'état en clair, nomme les précisions, et laisse vides les cases d'une ligne non renseignée", () => {
    const csv = allergenMatrixCsv(
      build([declaring(["UW", "BWD"], ["ML", "NR"]), product("vide")]),
      "fr",
    );
    const lines = linesOf(csv);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(lines[0]).toBe(
      '"Famille";"Produit";"Déclinaison";"SKU";"État";"Céréales contenant du gluten";"Lait";"Fruits à coque";"Autres"',
    );
    expect(lines).toContain(
      '"Viennoiseries";"Produit p";"";"SKU-p_v1";"";"contient : Blé / Peut contenir des traces : Seigle";"Peut contenir des traces";"";"contient : Sarrasin (BWD)"',
    );
    expect(lines).toContain(
      '"Viennoiseries";"Produit vide";"";"SKU-vide_v1";"Non renseigné";"";"";"";""',
    );
  });

  it("parle la langue demandée, jusqu'aux mots fixes", () => {
    const lines = linesOf(allergenMatrixCsv(build([product("vide")], { locale: "it" }), "it"));
    expect(lines[0]).toContain('"Famiglia";"Prodotto";"Variante";"SKU";"Stato"');
    expect(lines[0]?.endsWith('"Altri"')).toBe(true);
    expect(lines[1]).toContain('"Non compilato"');
  });
});
