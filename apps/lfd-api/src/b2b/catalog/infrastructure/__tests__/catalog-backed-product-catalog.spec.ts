import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import { family, PAINS, VIENNOISERIES } from "../../domain/__tests__/families.fixture.js";
import { CatalogBackedProductCatalog } from "../catalog-backed-product-catalog.js";

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
  unitPriceMillicents: 200_000,
  pimPriceMillicents: 240_000,
  vatRate: 5.5,
  categoryId: VIENNOISERIES.id,
  categoryName: VIENNOISERIES.name,
  family: VIENNOISERIES,
  isDefault: true,
  isFeatured: false,
  allergens: null,
  orderTimeLimit: null,
  note: null,
  image: null,
  thumbnail: null,
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

    const item = await catalog.resolve("VIE-001", "pro");

    expect(item?.sku).toBe("VIE-001");
    expect(await catalog.resolve("VIE-001-1", "pro")).toBeNull();
  });

  /** La décision B2B a déjà gagné en amont : l'adaptateur ne rejoue pas l'arbitrage. */
  it("rend le prix résolu, pas celui du PIM", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    expect((await catalog.resolve("VIE-001", "pro"))?.unitPriceMillicents).toBe(200_000);
  });

  it("sert la famille du référentiel telle que le miroir la porte", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    const item = await catalog.resolve("VIE-001", "pro");

    expect(item?.family).toEqual(VIENNOISERIES);
    expect(item?.article.categoryPath).toEqual(["fam-vien"]);
  });

  /**
   * Régression — panne du 2026-09-26 : une seconde famille « Viennoiseries »
   * créée au PIM n'avait pas de rayon dans la table en dur, l'adaptateur
   * levait, et tout ce qui lit le catalogue pro tombait en 500. Une famille
   * livrée par le référentiel est désormais un rayon, sans déploiement.
   */
  it("sert un article d'une famille qu'aucun code ne connaît, avec cette famille", async () => {
    const livree = family("01a031ff-146f-756f-a21b-4a2759a35e85", "Viennoiseries", 0);
    const orphan = { ...CROISSANT, categoryId: livree.id, family: livree };
    const catalog = new CatalogBackedProductCatalog(reader([orphan]));

    const item = await catalog.resolve("VIE-001", "pro");

    expect(item?.family?.id).toBe(livree.id);
    expect(item?.article.categoryPath).toEqual([livree.id]);
    expect(item?.unitPriceMillicents).toBe(200_000);
  });

  it("porte la lignée de la famille jusqu'au tarificateur", async () => {
    const tartes = family("fam-tartes", "Tartes", 3, ["fam-patis"]);
    const tarte = { ...CROISSANT, categoryId: tartes.id, family: tartes };
    const catalog = new CatalogBackedProductCatalog(reader([tarte]));

    const item = await catalog.resolve("VIE-001", "pro");

    expect(item?.article.categoryPath).toEqual(["fam-tartes", "fam-patis"]);
  });

  /** Les autres conditionnements n'existaient pas pour la boutique : ils n'entrent pas. */
  it("ne montre que les déclinaisons par défaut", async () => {
    const carton = { ...CROISSANT, sku: "VIE-001-2", isDefault: false };
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT, carton]));

    expect(await catalog.all()).toHaveLength(1);
  });

  it("range le catalogue dans l'ordre du référentiel, puis par nom", async () => {
    const pain = {
      ...CROISSANT,
      sku: "PAI-001-1",
      productSku: "PAI-001",
      name: "Baguette",
      categoryId: PAINS.id,
      family: PAINS,
    };
    const brioche = { ...CROISSANT, sku: "VIE-002-1", productSku: "VIE-002", name: "Brioche" };
    const catalog = new CatalogBackedProductCatalog(reader([pain, CROISSANT, brioche]));

    const names = (await catalog.all()).map((item) => item.name);

    // Viennoiseries (position 0) avant Pains (1), alphabétique à l'intérieur.
    expect(names).toEqual(["Brioche", "Croissant", "Baguette"]);
  });

  /** Par lot, parce que le chemin qui facture résout tout un panier d'un coup. */
  it("résout plusieurs SKU en une fois, et omet les inconnus", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    const found = await catalog.resolveMany(["VIE-001", "ZZZ-999"], "pro");

    expect([...found.keys()]).toEqual(["VIE-001"]);
  });
});
