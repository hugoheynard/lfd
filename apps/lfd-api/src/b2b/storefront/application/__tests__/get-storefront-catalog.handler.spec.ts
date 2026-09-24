import type { CatalogAdminItemView } from "@lfd/contracts";

import { CatalogAdminReader } from "../../../catalog/domain/ports/catalog-admin.reader.js";
import { CatalogBackedStorefrontCatalogReader } from "../../infrastructure/catalog-backed-storefront-catalog.reader.js";
import { GetStorefrontCatalogHandler } from "../get-storefront-catalog.handler.js";

/** Le catalogue d'administration, tel que `b2b/catalog` le rend. */
class ListedCatalog extends CatalogAdminReader {
  constructor(private readonly lines: CatalogAdminItemView[]) {
    super();
  }

  list(): Promise<CatalogAdminItemView[]> {
    return Promise.resolve(this.lines);
  }
}

/** Une ligne du catalogue ; `receivedAt` n'est jamais comparé à l'horloge. */
function line(overrides: Partial<CatalogAdminItemView>): CatalogAdminItemView {
  return {
    sku: "PAI-001-1",
    productSku: "PAI-001",
    name: "Baguette",
    categoryId: "bread",
    categoryName: "Pains",
    pimPriceMillicents: 100_000,
    b2bPriceMillicents: 90_000,
    effectivePriceMillicents: 90_000,
    publicTtcCents: 120,
    publicVatRatePercent: 5.5,
    decidedPublicTtcCents: null,
    vatRatePercent: 5.5,
    allergens: null,
    allergensIncomplete: false,
    isHidden: false,
    isHiddenPublic: false,
    isFeatured: false,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    receivedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function handlerOver(lines: CatalogAdminItemView[]): GetStorefrontCatalogHandler {
  return new GetStorefrontCatalogHandler(
    new CatalogBackedStorefrontCatalogReader(new ListedCatalog(lines)),
  );
}

describe("GetStorefrontCatalogHandler", () => {
  it("rend le SKU du PRODUIT, une fois, et rien du prix ni des réglages", async () => {
    const view = await handlerOver([
      line({ sku: "PAI-001-1" }),
      line({ sku: "PAI-001-2", name: "Baguette (grande)" }),
    ]).execute();

    expect(view).toEqual({
      shelves: [{ key: "bread", name: "Pains" }],
      items: [{ sku: "PAI-001", name: "Baguette", shelfKey: "bread", served: true }],
    });
  });

  it("un article masqué des DEUX boutiques n'est pas servi, et ne fait pas son rayon", async () => {
    const view = await handlerOver([
      line({}),
      line({
        sku: "VIE-001-1",
        productSku: "VIE-001",
        name: "Croissant",
        categoryId: "pastry",
        categoryName: "Viennoiseries",
        isHidden: true,
        isHiddenPublic: true,
      }),
    ]).execute();

    expect(view.shelves).toEqual([{ key: "bread", name: "Pains" }]);
    expect(view.items).toContainEqual({
      sku: "VIE-001",
      name: "Croissant",
      shelfKey: "pastry",
      served: false,
    });
  });

  it("masqué d'une seule boutique, il reste servi", async () => {
    const view = await handlerOver([
      line({ isHidden: true }),
      line({ sku: "X-1", productSku: "X", isHiddenPublic: true }),
    ]).execute();

    expect(view.items.map((item) => item.served)).toEqual([true, true]);
  });

  it("un produit est servi si UNE de ses déclinaisons l'est, sous le nom de celle-là", async () => {
    const view = await handlerOver([
      line({ sku: "PAI-001-1", name: "Masquée", isHidden: true, isHiddenPublic: true }),
      line({ sku: "PAI-001-2", name: "Servie" }),
    ]).execute();

    expect(view.items).toEqual([
      { sku: "PAI-001", name: "Servie", shelfKey: "bread", served: true },
    ]);
  });

  it("les rayons suivent l'ordre du catalogue", async () => {
    const view = await handlerOver([
      line({ productSku: "A", categoryId: "pastry", categoryName: "Viennoiseries" }),
      line({ productSku: "B" }),
      line({ productSku: "C", categoryId: "pastry", categoryName: "Viennoiseries" }),
    ]).execute();

    expect(view.shelves.map((shelf) => shelf.key)).toEqual(["pastry", "bread"]);
  });
});
