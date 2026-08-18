import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../../catalog/domain/ports/catalog.reader.js";
import { CatalogBackedProductCatalog } from "../catalog-backed-product-catalog.js";
import { UnknownCatalogShelfError } from "../../domain/errors/unknown-catalog-shelf.error.js";

/**
 * **La bascule du catalogue** (Cat C5b), éprouvée sur ce qui compte : ce que
 * l'adaptateur change, et ce qu'il ne doit surtout pas changer.
 *
 * Ce qu'il change : la source du prix, qui passe d'une constante compilée à la
 * base. Ce qu'il ne change pas : l'IDENTIFIANT vendu. La boutique vend le SKU
 * du produit depuis l'ouverture commerciale, et ce SKU est écrit dans toutes les
 * commandes passées.
 */

const CROISSANT: ResolvedCatalogItem = {
  sku: "VIE-001-1",
  productSku: "VIE-001",
  name: "Croissant",
  unitPriceCents: 200,
  pimPriceCents: 240,
  vatRate: 5.5,
  categoryId: "cat_vien",
  categoryName: "Viennoiseries",
  isDefault: true,
  isFeatured: false,
};

function reader(items: readonly ResolvedCatalogItem[]): CatalogReader {
  const byProduct = new Map(items.filter((item) => item.isDefault).map((i) => [i.productSku, i]));
  return {
    findSku: (sku) => Promise.resolve(items.find((item) => item.sku === sku) ?? null),
    listSellable: () => Promise.resolve([...items]),
    findDefaultByProductSku: (productSku) => Promise.resolve(byProduct.get(productSku) ?? null),
    listDefaultsByProductSkus: (skus) =>
      Promise.resolve(
        new Map(
          skus.flatMap((sku) => {
            const found = byProduct.get(sku);
            return found === undefined ? [] : [[sku, found] as const];
          }),
        ),
      ),
  };
}

describe("le catalogue du checkout, branché sur la base", () => {
  /**
   * Le test qui garde la compatibilité : le PIM vend `VIE-001-1`, la boutique
   * vend `VIE-001`. Exposer le SKU du PIM aurait rendu illisibles toutes les
   * commandes déjà passées.
   */
  it("vend l'article sous le SKU de son PRODUIT, pas celui de sa déclinaison", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    const item = await catalog.resolve("VIE-001");

    expect(item?.sku).toBe("VIE-001");
    expect(await catalog.resolve("VIE-001-1")).toBeNull();
  });

  /** La décision B2B a déjà gagné en amont : l'adaptateur ne rejoue pas l'arbitrage. */
  it("rend le prix résolu, pas celui du PIM", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    expect((await catalog.resolve("VIE-001"))?.unitPriceCents).toBe(200);
  });

  it("traduit la famille du PIM en rayon de la boutique", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    expect((await catalog.resolve("VIE-001"))?.category).toBe("viennoiserie");
  });

  /**
   * Un rayon faux ferait appliquer à l'article les règles de prix d'une AUTRE
   * famille — et rien ne le signalerait avant la facture. Le refus est donc
   * préférable au rangement par défaut.
   */
  it("refuse un article dont la famille n'a pas de rayon", async () => {
    const orphan = { ...CROISSANT, categoryId: "cat_inconnue" };
    const catalog = new CatalogBackedProductCatalog(reader([orphan]));

    await expect(catalog.resolve("VIE-001")).rejects.toThrow(UnknownCatalogShelfError);
  });

  /** Les autres conditionnements n'existaient pas pour la boutique : ils n'entrent pas. */
  it("ne montre que les déclinaisons par défaut", async () => {
    const carton = { ...CROISSANT, sku: "VIE-001-2", isDefault: false };
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT, carton]));

    expect(await catalog.all()).toHaveLength(1);
  });

  it("range le catalogue dans l'ordre de la vitrine, puis par nom", async () => {
    const pain = {
      ...CROISSANT,
      sku: "PAI-001-1",
      productSku: "PAI-001",
      name: "Baguette",
      categoryId: "cat_pains",
    };
    const brioche = { ...CROISSANT, sku: "VIE-002-1", productSku: "VIE-002", name: "Brioche" };
    const catalog = new CatalogBackedProductCatalog(reader([pain, CROISSANT, brioche]));

    const names = (await catalog.all()).map((item) => item.name);

    // Viennoiseries avant Pains (ordre de vitrine), alphabétique à l'intérieur.
    expect(names).toEqual(["Brioche", "Croissant", "Baguette"]);
  });

  /** Par lot, parce que le chemin qui facture résout tout un panier d'un coup. */
  it("résout plusieurs SKU en une fois, et omet les inconnus", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    const found = await catalog.resolveMany(["VIE-001", "ZZZ-999"]);

    expect([...found.keys()]).toEqual(["VIE-001"]);
  });
});
