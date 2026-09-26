import type { CatalogFamily } from "../../domain/catalog-family.js";
import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import { family, PAINS, VIENNOISERIES } from "../../domain/__tests__/families.fixture.js";
import { CatalogWorkshopShelvesReader } from "../catalog-workshop-shelves.reader.js";

/**
 * **Le rayon des articles du fournil** : un article orphelin ne fait pas tomber
 * la fiche, et une vraie panne n'est pas déguisée en « hors catalogue ».
 */

function item(productSku: string, of: CatalogFamily): ResolvedCatalogItem {
  return {
    sku: `${productSku}-1`,
    productSku,
    name: productSku,
    unitPriceMillicents: 200_000,
    pimPriceMillicents: 200_000,
    vatRate: 5.5,
    categoryId: of.id,
    categoryName: of.name,
    family: of,
    isDefault: true,
    isFeatured: false,
    allergens: null,
    orderTimeLimit: null,
    note: null,
    image: null,
    thumbnail: null,
  };
}

/** Le catalogue doublé : il ÉTEND le port, et ne sert que la lecture par lot. */
class Catalog extends CatalogReader {
  asked: readonly string[] = [];

  constructor(private readonly items: readonly ResolvedCatalogItem[]) {
    super();
  }

  findSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listSellable(): Promise<ResolvedCatalogItem[]> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  findDefaultByProductSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.reject(new Error("lecture inattendue"));
  }

  listDefaultsByProductSkus(
    productSkus: readonly string[],
  ): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    this.asked = productSkus;
    return Promise.resolve(
      new Map(
        this.items
          .filter((entry) => productSkus.includes(entry.productSku))
          .map((entry) => [entry.productSku, entry] as const),
      ),
    );
  }
}

class BrokenCatalog extends Catalog {
  override listDefaultsByProductSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.reject(new Error("base injoignable"));
  }
}

describe("CatalogWorkshopShelvesReader", () => {
  it("range sous la famille du référentiel, sous le SKU du PRODUIT", async () => {
    const catalog = new Catalog([item("VIE-001", VIENNOISERIES), item("PAI-001", PAINS)]);

    const shelves = await new CatalogWorkshopShelvesReader(catalog).shelvesOf([
      "VIE-001",
      "PAI-001",
    ]);

    expect(catalog.asked).toEqual(["VIE-001", "PAI-001"]);
    expect([...shelves.entries()]).toEqual([
      ["VIE-001", { id: "fam-vien", name: "Viennoiseries", position: 0 }],
      ["PAI-001", { id: "fam-pain", name: "Pains", position: 1 }],
    ]);
  });

  /**
   * Régression — panne du 2026-09-26 : une famille que la table en dur ne
   * connaissait pas rendait son article orphelin. Livrée par le référentiel,
   * elle est un rayon comme les autres.
   */
  it("range un article d'une famille qu'aucun code ne connaît", async () => {
    const livree = family("01a0-inventee", "Snacking", 5);
    const catalog = new Catalog([item("VIE-001", VIENNOISERIES), item("NEW-001", livree)]);

    const shelves = await new CatalogWorkshopShelvesReader(catalog).shelvesOf([
      "VIE-001",
      "NEW-001",
    ]);

    expect(shelves.get("NEW-001")).toEqual({ id: "01a0-inventee", name: "Snacking", position: 5 });
  });

  it("un SKU inconnu du catalogue est absent, jamais présent à `null`", async () => {
    const shelves = await new CatalogWorkshopShelvesReader(new Catalog([])).shelvesOf(["XXX-001"]);

    expect(shelves.size).toBe(0);
  });

  it("laisse REMONTER une vraie panne — ce n'est pas un article hors catalogue", async () => {
    const reader = new CatalogWorkshopShelvesReader(new BrokenCatalog([]));

    await expect(reader.shelvesOf(["VIE-001"])).rejects.toThrow("base injoignable");
  });
});
