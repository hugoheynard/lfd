import { FLAT_LINEAGE, lineageFrom } from "../catalog-family-lineage.js";
import { type ArticleRow, articleOf } from "../prisma-resupply-only-articles.reader.js";

const VIENNOISERIE = { id: "fam-vien", parentId: null, name: "Viennoiserie", position: 0 };
const FINE = { id: "fam-fine", parentId: "fam-vien", name: "Viennoiserie fine", position: 2 };

/** Le cookie des formules, rangé sous une sous-famille. */
function row(category: ArticleRow["category"]): ArticleRow {
  return {
    sku: "VIE-009-1",
    name: "Cookie formule",
    audience: "resupply",
    isDefault: true,
    saleUnit: "piece",
    customRecipe: false,
    publicReviewPending: false,
    proReviewPending: false,
    category,
    override: null,
    _count: { reservations: 0 },
  };
}

describe("articleOf — la famille d'un article réservé au réassort", () => {
  it("sert sa famille avec ses parentes, lues sur la lignée du miroir", () => {
    const lineage = lineageFrom(
      [VIENNOISERIE, FINE].map((family) => ({ ...family, nameTranslations: null })),
    );

    const article = articleOf(row({ ...FINE, slug: "fine" }), lineage);

    expect(article?.categoryId).toBe(FINE.id);
    expect(article?.family).toEqual({
      id: FINE.id,
      name: FINE.name,
      position: FINE.position,
      root: { id: VIENNOISERIE.id, name: VIENNOISERIE.name, position: VIENNOISERIE.position },
      path: [FINE.id, VIENNOISERIE.id],
      ancestors: [
        { id: VIENNOISERIE.id, name: VIENNOISERIE.name, position: VIENNOISERIE.position },
      ],
    });
  });

  it("une famille de tête n'a aucune parente", () => {
    const article = articleOf(row({ ...VIENNOISERIE, slug: "famille-de-tete" }), FLAT_LINEAGE);

    expect(article?.family).not.toHaveProperty("ancestors");
    expect(article?.family).toMatchObject({ id: VIENNOISERIE.id, path: [VIENNOISERIE.id] });
  });
});
