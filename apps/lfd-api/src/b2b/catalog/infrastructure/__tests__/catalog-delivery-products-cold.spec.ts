import { CatalogColdReader } from "../../domain/ports/catalog-cold.reader.js";
import type { UnsealedCatalogItem } from "../../domain/ports/product-catalog.reader.js";
import { CatalogDeliveryProductsReader } from "../catalog-delivery-products.reader.js";
import { InMemoryProductCatalog } from "../in-memory-product-catalog.js";

/**
 * **Le froid relayé à la livraison** (lot 4 bis, v2-2) : la fiche du
 * référentiel le dit, le fil v12 le porte, le miroir le range — et le relais
 * le sert sous le SKU produit que portent les lignes de commande.
 */

class FixedColdSkus extends CatalogColdReader {
  constructor(private readonly skus: readonly string[]) {
    super();
  }
  coldProductSkus(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.skus));
  }
}

function article(sku: string, name: string): UnsealedCatalogItem {
  return {
    sku,
    name,
    unitPriceMillicents: 220_000,
    vatRate: 5.5,
    family: null,
    allergens: null,
    orderTimeLimit: null,
  };
}

const catalog = new InMemoryProductCatalog([
  article("TAR-001", "Tarte au citron"),
  article("VIE-001", "Croissant"),
]);

describe("CatalogDeliveryProductsReader — le froid des produits", () => {
  it("dit froid le produit que le miroir tient froid, et sec les autres", async () => {
    const reader = new CatalogDeliveryProductsReader(catalog, new FixedColdSkus(["TAR-001"]));

    expect(await reader.sold()).toEqual([
      { sku: "TAR-001", name: "Tarte au citron", requiresCold: true },
      { sku: "VIE-001", name: "Croissant", requiresCold: false },
    ]);
  });

  it("n'invente aucun froid pour un SKU froid qui n'est plus vendu", async () => {
    const reader = new CatalogDeliveryProductsReader(catalog, new FixedColdSkus(["PAT-404"]));

    const products = await reader.sold();

    expect(products.every((product) => !product.requiresCold)).toBe(true);
  });
});
