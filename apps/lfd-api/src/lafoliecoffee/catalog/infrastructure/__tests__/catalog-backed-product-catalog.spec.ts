import { NO_TRANSLATIONS } from "../../domain/catalog-translations.js";
import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import { family, PAINS, VIENNOISERIES } from "../../domain/__tests__/families.fixture.js";
import { CatalogBackedProductCatalog } from "../catalog-backed-product-catalog.js";
import { staffViewer } from "../../domain/catalog-viewer.js";

/** Le lecteur ne change rien ici : le double ne le lit pas, le mur est en amont. */
const VIEWER = staffViewer("pro");

/**
 * **La bascule du catalogue** (Cat C5b), éprouvée sur ce qui compte : ce que
 * l'adaptateur change, et ce qu'il ne doit surtout pas changer.
 *
 * Ce qu'il change : la source du prix, qui passe d'une constante compilée à la
 * base. L'IDENTIFIANT vendu est la référence de la déclinaison, défaut compris,
 * depuis la bascule du 2026-10-29 (`plan-defaut-sous-sa-reference.md`, L3) ;
 * la référence produit des commandes passées se traduit à l'entrée, pas ici.
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
  audience: "both",
  reservation: "none",
  translations: { name: NO_TRANSLATIONS, note: NO_TRANSLATIONS, categoryName: NO_TRANSLATIONS },
  family: VIENNOISERIES,
  isDefault: true,
  variantsAsTiles: true,
  saleUnit: "piece",
  weightMinGrams: null,
  weightStepGrams: null,
  minQuantities: { pro: null, public: null },
  isFeatured: false,
  allergens: null,
  shopAllergens: { codes: null, incomplete: false, precautionary: false, texts: null },
  orderTimeLimit: null,
  note: null,
  image: null,
  thumbnail: null,
};

/** Le lecteur, sur la règle de `soldUnderShopSkus` : par SKU, défaut ou vignette. */
function reader(items: readonly ResolvedCatalogItem[]): CatalogReader {
  const byProduct = new Map(
    items.filter((item) => item.isDefault || item.variantsAsTiles).map((i) => [i.sku, i]),
  );
  return {
    listSellable: () => Promise.resolve([...items]),
    findByShopSku: (shopSku) => Promise.resolve(byProduct.get(shopSku) ?? null),
    listByShopSkus: (skus) =>
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
   * La bascule (`plan-defaut-sous-sa-reference.md`, L3) : le défaut se vendait
   * sous `VIE-001`, la référence de son produit, qui glissait au changement de
   * défaut. Il se vend sous la sienne ; la référence produit ne résout plus.
   */
  it("vend le défaut sous la référence de SA déclinaison, plus sous celle du produit", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    const item = await catalog.resolve("VIE-001-1", VIEWER);

    expect(item?.sku).toBe("VIE-001-1");
    expect(await catalog.resolve("VIE-001", VIEWER)).toBeNull();
  });

  /** La décision B2B a déjà gagné en amont : l'adaptateur ne rejoue pas l'arbitrage. */
  it("rend le prix résolu, pas celui du PIM", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    expect((await catalog.resolve("VIE-001-1", VIEWER))?.unitPriceMillicents).toBe(200_000);
  });

  it("sert la famille du référentiel telle que le miroir la porte", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    const item = await catalog.resolve("VIE-001-1", VIEWER);

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

    const item = await catalog.resolve("VIE-001-1", VIEWER);

    expect(item?.family?.id).toBe(livree.id);
    expect(item?.article.categoryPath).toEqual([livree.id]);
    expect(item?.unitPriceMillicents).toBe(200_000);
  });

  it("porte la lignée de la famille jusqu'au tarificateur", async () => {
    const tartes = family("fam-tartes", "Tartes", 3, ["fam-patis"]);
    const tarte = { ...CROISSANT, categoryId: tartes.id, family: tartes };
    const catalog = new CatalogBackedProductCatalog(reader([tarte]));

    const item = await catalog.resolve("VIE-001-1", VIEWER);

    expect(item?.article.categoryPath).toEqual(["fam-tartes", "fam-patis"]);
  });

  /** Une fiche qui ne montre pas ses déclinaisons n'en vend que le défaut. */
  it("ne liste que le défaut d'une fiche qui ne montre pas ses déclinaisons", async () => {
    const single = { ...CROISSANT, variantsAsTiles: false };
    const carton = { ...single, sku: "VIE-001-2", isDefault: false };
    const catalog = new CatalogBackedProductCatalog(reader([single, carton]));

    expect((await catalog.all(VIEWER)).map((item) => item.sku)).toEqual(["VIE-001-1"]);
  });

  /**
   * Régression (plan-pro-voit-les-declinaisons, L4, 2026-10-29) : `all()`
   * gardait le seul défaut, et la saisie staff ne proposait pas la part d'une
   * fiche montrée en vignette, que la vitrine vendait pourtant.
   */
  it("la saisie staff propose la part d'une fiche montrée en vignette", async () => {
    const part = { ...CROISSANT, sku: "VIE-001-2", isDefault: false, name: "Croissant part" };
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT, part]));

    const listed = await catalog.all(VIEWER);

    expect(listed.map((item) => [item.sku, item.name])).toEqual([
      ["VIE-001-1", "Croissant"],
      ["VIE-001-2", "Croissant part"],
    ]);
    // Le sceau porte le même SKU de vente que la ligne : le tarificateur vise
    // `VIE-001-2`, pas son produit (modèle à plat).
    expect(listed[1]?.article.sku).toBe("VIE-001-2");
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

    const names = (await catalog.all(VIEWER)).map((item) => item.name);

    // Viennoiseries (position 0) avant Pains (1), alphabétique à l'intérieur.
    expect(names).toEqual(["Brioche", "Croissant", "Baguette"]);
  });

  /** Par lot, parce que le chemin qui facture résout tout un panier d'un coup. */
  it("résout plusieurs SKU en une fois, et omet les inconnus", async () => {
    const catalog = new CatalogBackedProductCatalog(reader([CROISSANT]));

    const found = await catalog.resolveMany(["VIE-001-1", "ZZZ-999"], VIEWER);

    expect([...found.keys()]).toEqual(["VIE-001-1"]);
  });

  /** Le mur est en amont (`servedToViewer`) : l'étiquette traverse telle quelle. */
  it("porte l'étiquette de réservation jusqu'au chemin qui facture", async () => {
    const locked = { ...CROISSANT, reservation: "other" as const };
    const catalog = new CatalogBackedProductCatalog(reader([locked]));

    expect((await catalog.resolve("VIE-001-1", VIEWER))?.reservation).toBe("other");
  });
});
