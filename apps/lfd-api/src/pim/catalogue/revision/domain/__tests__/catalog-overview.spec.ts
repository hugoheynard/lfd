import { CategoryNotFoundError } from "../../../category/domain/errors/category-errors.js";
import { countCatalogOverview } from "../catalog-overview.js";
import type { OverviewProductRow } from "../ports/catalog-overview.reader.js";

function row(over: Partial<OverviewProductRow> = {}): OverviewProductRow {
  return {
    productId: "prd_1",
    status: "draft",
    categoryId: "cat_1",
    articles: 1,
    signed: false,
    categoryKnown: true,
    ...over,
  };
}

describe("countCatalogOverview — la règle de l'ancre, comptée", () => {
  it("compte par fiche, et chaque déclinaison (arrêtées comprises) comme un article", () => {
    const counts = countCatalogOverview([
      row({ productId: "prd_1", status: "published", articles: 3, signed: true }),
      row({ productId: "prd_2", status: "draft", articles: 2 }),
    ]);

    expect(counts).toEqual({ products: 2, published: 1, drafts: 1, signed: 1, articles: 5 });
  });

  it("ne compte ni les archivées ni les supprimées (`isLiveStatus`)", () => {
    const counts = countCatalogOverview([
      row({ productId: "prd_1", status: "archived", articles: 4, signed: true }),
      row({ productId: "prd_2", status: "deleted", articles: 1 }),
      row({ productId: "prd_3", status: "published" }),
    ]);

    expect(counts).toEqual({ products: 1, published: 1, drafts: 0, signed: 0, articles: 1 });
  });

  it("ne compte pas une fiche sans déclinaison : l'ancre n'en aurait aucun article", () => {
    expect(countCatalogOverview([row({ articles: 0, signed: true })])).toEqual({
      products: 0,
      published: 0,
      drafts: 0,
      signed: 0,
      articles: 0,
    });
  });

  it("refuse une fiche vivante rattachée à une famille inconnue", () => {
    expect(() =>
      countCatalogOverview([row({ categoryId: "cat_perdue", categoryKnown: false })]),
    ).toThrow(CategoryNotFoundError);
  });

  it("ne refuse pas une archivée au rattachement cassé : elle ne compte pas", () => {
    expect(countCatalogOverview([row({ status: "archived", categoryKnown: false })]).products).toBe(
      0,
    );
  });
});
