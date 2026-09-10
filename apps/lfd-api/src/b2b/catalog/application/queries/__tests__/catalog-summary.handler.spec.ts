import type { CatalogAdminItemView } from "@lfd/contracts";

import { CatalogAdminReader } from "../../../domain/ports/catalog-admin.reader.js";
import { GetCatalogSummaryHandler } from "../get-catalog-summary.handler.js";
import { GetCatalogSummaryQuery } from "../get-catalog-summary.query.js";

function item(over: Partial<CatalogAdminItemView> = {}): CatalogAdminItemView {
  return {
    sku: "VIE-001-1",
    productSku: "VIE-001",
    name: "Croissant",
    categoryId: "cat_1",
    categoryName: "Viennoiserie",
    pimPriceMillicents: 120_000,
    b2bPriceMillicents: null,
    effectivePriceMillicents: 120_000,
    vatRatePercent: 5.5,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isFeatured: false,
    decidedBy: null,
    decidedAt: null,
    ...over,
  };
}

class FakeCatalog extends CatalogAdminReader {
  constructor(private readonly rows: CatalogAdminItemView[]) {
    super();
  }

  list(): Promise<CatalogAdminItemView[]> {
    return Promise.resolve(this.rows);
  }
}

describe("GetCatalogSummaryHandler", () => {
  it("🔴 n'annonce PAS en vente un article sans taux de TVA", async () => {
    // Il n'est pas masqué, et la boutique l'écarte quand même : `CatalogReader`
    // refuse d'inventer 5,5 %. Ne compter que `!isHidden` afficherait un
    // catalogue plus grand que celui que les clients voient.
    const view = await new GetCatalogSummaryHandler(
      new FakeCatalog([item({ vatRatePercent: null })]),
    ).execute(new GetCatalogSummaryQuery());

    expect(view).toEqual({ onSale: 0, withoutVatRate: 1, hidden: 0 });
  });

  it("compte un article à la fois masqué ET sans taux dans les deux colonnes", async () => {
    // Les deux nombres répondent à deux questions ; ils ne partitionnent pas.
    const view = await new GetCatalogSummaryHandler(
      new FakeCatalog([item({ isHidden: true, vatRatePercent: null })]),
    ).execute(new GetCatalogSummaryQuery());

    expect(view).toEqual({ onSale: 0, withoutVatRate: 1, hidden: 1 });
  });

  it("compte ce qui est réellement commandable", async () => {
    const view = await new GetCatalogSummaryHandler(
      new FakeCatalog([
        item({ sku: "A" }),
        item({ sku: "B" }),
        item({ sku: "C", isHidden: true }),
        item({ sku: "D", vatRatePercent: null }),
      ]),
    ).execute(new GetCatalogSummaryQuery());

    expect(view).toEqual({ onSale: 2, withoutVatRate: 1, hidden: 1 });
  });

  it("rend des zéros sur un catalogue vide, jamais un vide", async () => {
    const view = await new GetCatalogSummaryHandler(new FakeCatalog([])).execute(
      new GetCatalogSummaryQuery(),
    );

    expect(view).toEqual({ onSale: 0, withoutVatRate: 0, hidden: 0 });
  });
});
