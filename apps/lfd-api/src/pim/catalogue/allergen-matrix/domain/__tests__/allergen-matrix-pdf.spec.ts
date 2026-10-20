import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import { buildAllergenMatrix, type MatrixFilters } from "../allergen-matrix.js";
import {
  allergenMatrixPdfFileName,
  renderAllergenMatrixPdf,
  type AllergenMatrixPaper,
} from "../allergen-matrix-pdf.js";
import type { AllergenCategoryView } from "../../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { families, product, referential, variant } from "./matrix-fixtures.js";
import type { ProductRecord } from "../../../product/domain/ports/product.repository.js";

/**
 * Le PDF de la matrice (plan AM2), **lu** : on ouvre les octets et on lit le
 * texte qu'ils portent, page par page — et, pour les signes ● ◐ que les
 * polices n'ont pas, on compte les formes dessinées.
 */

const LOGO = readFileSync(
  new URL("../../../../../../assets/logo-la-folie-coffee-noir-et-blanc.png", import.meta.url),
);

/** Comparée à rien d'autre que son propre rendu : jamais à l'horloge. */
const GENERATED_AT = new Date("2026-10-20T19:59:00.000Z");

const DEFAULTS: MatrixFilters = {
  locale: "fr",
  scope: "published",
  categoryId: null,
  includeUndeclared: true,
};

function paper(
  products: readonly ProductRecord[],
  over: Partial<MatrixFilters> = {},
  categories: readonly AllergenCategoryView[] = referential(),
): AllergenMatrixPaper {
  const filters = { ...DEFAULTS, ...over };
  return {
    matrix: buildAllergenMatrix({
      referential: categories,
      products,
      families: families(),
      filters,
    }),
    filters,
    familyName: null,
    generatedAt: GENERATED_AT,
    lastModifiedAt: null,
  };
}

function declaring(
  id: string,
  declared: readonly string[],
  mayContain: readonly string[] = [],
): ProductRecord {
  return product(id, {
    variants: [variant(`${id}_v1`, { allergenSheet: { declared, mayContain } })],
  });
}

/** Le texte de chaque page, les retours à la ligne d'un texte habillé recollés. */
async function pagesOf(input: AllergenMatrixPaper): Promise<string[]> {
  return pdfPages(await renderAllergenMatrixPdf(input, LOGO)).map((page) =>
    page.replace(/\s+/gu, " "),
  );
}

/** Les courbes de Bézier des flux de page : un disque en compte quatre. */
function curves(pdf: Buffer): number {
  const raw = pdf.toString("latin1");
  const stream = /\/Length (\d+)[^>]*>>\s*stream\r?\n/g;
  let count = 0;
  for (let match = stream.exec(raw); match !== null; match = stream.exec(raw)) {
    const start = match.index + match[0].length;
    try {
      const content = inflateSync(
        Buffer.from(raw.slice(start, start + Number(match[1])), "latin1"),
      );
      count += content.toString("latin1").match(/ c\n/gu)?.length ?? 0;
    } catch {
      // un flux d'image n'est pas un flux de page
    }
  }
  return count;
}

describe("renderAllergenMatrixPdf", () => {
  it("rend les mêmes octets deux fois", async () => {
    const input = paper([declaring("a", ["UW"])]);
    const first = await renderAllergenMatrixPdf(input, LOGO);
    expect(first.equals(await renderAllergenMatrixPdf(input, LOGO))).toBe(true);
    // Paysage : la page est plus large que haute.
    expect(first.toString("latin1")).toContain("/MediaBox [0 0 841.89 595.28]");
  });

  it("porte le titre de l'annexe II, le périmètre, la légende, les états et le pied daté", async () => {
    const [page] = await pagesOf(paper([declaring("a", ["UW"], ["SA"]), product("vide")]));
    expect(page).toContain("Substances ou produits provoquant des allergies ou intolérances");
    expect(page).toContain(
      "Périmètre : Produits publiés · Toutes les familles · Non renseignés inclus",
    );
    expect(page).toContain("Générée le 20 octobre 2026 à 21:59");
    expect(page).toContain("Produit Gluten Lait Fruits à coque Autres");
    expect(page).toContain("Gluten : céréales contenant du gluten");
    expect(page).toContain("Non renseigné");
    expect(page).toContain("Contient"); // la légende ouvre par une capitale (Hugo, 2026-10-20)
    expect(page).toContain("Peut contenir des traces");
    expect(page).toContain(
      "Établie à partir des fiches au 20 octobre 2026 à 21:59 ; la déclaration en vigueur est celle de l'étiquette.",
    );
    expect(page).toContain("Page 1/1");
  });

  it("nomme la céréale et le fruit à coque, et affiche le code GS1 d'un « Autres » officiel seulement", async () => {
    const [page] = await pagesOf(paper([declaring("a", ["UW", "BWD"], ["SA", "PERSO"])]));
    expect(page).toContain("Blé");
    expect(page).toContain("Amandes");
    expect(page).toContain("Sarrasin (BWD)");
    expect(page).toContain("Lupin doux");
    expect(page).not.toContain("PERSO");
  });

  it("dessine un ● par case « contient » et un ◐ par case « traces » — la police ne les a pas", async () => {
    const none = curves(await renderAllergenMatrixPdf(paper([declaring("a", [])]), LOGO));
    const contains = curves(await renderAllergenMatrixPdf(paper([declaring("a", ["ML"])]), LOGO));
    const traces = curves(await renderAllergenMatrixPdf(paper([declaring("a", [], ["ML"])]), LOGO));
    expect(contains - none).toBe(4);
    expect(traces - none).toBeGreaterThan(4);
  });

  it("répète les en-têtes de colonnes et le pied à chaque page", async () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      declaring(`p${String(index).padStart(2, "0")}`, ["UW", "SA"]),
    );
    const pages = await pagesOf(paper(many));
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, index) => {
      expect(page).toContain("Produit Gluten Lait Fruits à coque Autres");
      expect(page).toContain("Gluten : céréales contenant du gluten");
      expect(page).toContain(`Page ${String(index + 1)}/${String(pages.length)}`);
      expect(page).toContain("Établie à partir des fiches au 20 octobre 2026");
    });
    expect(pages[1]).toContain("(suite)");
  });

  it("est ENTIER en italien, et dit en tête qu'une mention manque (Q4)", async () => {
    // Le lait sans italien : sa colonne s'imprime en français, et le PDF le dit.
    const untranslatedMilk = referential().map((category) =>
      category.key === "milk" ? { ...category, name: { fr: "Lait" } } : category,
    );
    const [page] = await pagesOf(
      paper([declaring("a", ["UW"], ["ML"]), product("vide")], { locale: "it" }, untranslatedMilk),
    );
    expect(page).toContain("Lait");
    expect(page).toContain("Sostanze o prodotti che provocano allergie o intolleranze");
    expect(page).toContain("Generata il 20 ottobre 2026 alle 21:59");
    expect(page).toContain("Contiene");
    expect(page).toContain("Può contenere tracce");
    expect(page).toContain("Non compilato");
    expect(page).toContain("Pagina 1/1");
    // Le plus long en-tête des trois langues tient sur une ligne (en-tête resserré, 2026-10-20).
    expect(page).toContain("Glutine Lait Frutta a guscio Altri");
    expect(page).toContain("Glutine: cereali contenenti glutine");
    expect(page).toContain("Alcune diciture non esistono ancora in questa lingua");
  });

  it("ne dit rien de tel quand toutes les mentions sont traduites", async () => {
    const [page] = await pagesOf(paper([declaring("a", ["UW"])]));
    expect(page).not.toContain("Certaines mentions");
  });

  it("nomme le fichier dans sa langue", () => {
    expect(allergenMatrixPdfFileName("it")).toBe("matrice-allergenes-it.pdf");
  });
});
