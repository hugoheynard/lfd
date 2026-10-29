import { Injectable } from "@nestjs/common";

import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../domain/ports/catalog.reader.js";
import { catalogueArticle } from "../domain/catalogue-article.js";
import { compareFamilies } from "../domain/catalog-family.js";
import { isShownAsTile, shopSkuOf } from "../domain/shop-sku.js";
import { ProductCatalogReader, type CatalogItem } from "../domain/ports/product-catalog.reader.js";

/**
 * **L'autorité de prix du checkout, branchée sur la base.**
 *
 * A remplacé un catalogue **semé en dur**, dont le prix était une constante
 * compilée : l'écran de tarification comme la frise résolvaient de vraies
 * décisions contre des tarifs figés, et historiser ce canonique n'aurait rien
 * historisé. Ce semis a fini sa vie de source de production ; il ne survit que
 * comme jeu de données de test (`test/catalog-seed.ts`).
 *
 * **L'identifiant ne change pas.** La boutique vend le SKU du PRODUIT
 * (`VIE-001`) depuis l'ouverture commerciale ; le PIM, lui, vend la déclinaison
 * (`VIE-001-1`). Cet adaptateur présente donc la déclinaison **par défaut** sous
 * le SKU de son produit. Une bascule qui aurait exposé les SKU du PIM aurait
 * rendu illisibles toutes les commandes déjà passées, tous les paniers
 * récurrents et tous les brouillons — pour un gain nul.
 *
 * Les autres déclinaisons se résolvent sous LEUR SKU quand leur fiche montre
 * chaque déclinaison en vignette (`plan-declinaisons-en-vignette.md`, V4,
 * 2026-10-29) : la caisse vend ce que la vitrine montre. `all()` les liste
 * aussi depuis le 2026-10-29 (`plan-pro-voit-les-declinaisons.md`, L4) : la
 * saisie staff, le tableau des prix et la grille des bacs proposent ce que la
 * vitrine pro montre.
 */
@Injectable()
export class CatalogBackedProductCatalog extends ProductCatalogReader {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async resolve(sku: string, audience: ShopAudience): Promise<CatalogItem | null> {
    const item = await this.catalog.findByShopSku(sku, audience);
    return item === null ? null : toCatalogItem(item);
  }

  async resolveMany(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, CatalogItem>> {
    const items = await this.catalog.listByShopSkus(skus, audience);
    const found = new Map<string, CatalogItem>();
    for (const [shopSku, item] of items) {
      found.set(shopSku, toCatalogItem(item));
    }
    return found;
  }

  /**
   * Le catalogue vendable, **rangé comme le référentiel** : la position de la
   * famille, puis l'alphabet. Plus d'ordre des rayons dans le code — celui du
   * PIM fait foi, et une famille nouvelle y prend sa place sans déploiement.
   *
   * **Ce que la vitrine pro montre** (`isShownAsTile`) : le défaut, plus chaque
   * déclinaison d'une fiche en vignette — chacune sous son SKU de vente
   * (`shopSkuOf`, le seul point qui décide de cette clé). Une déclinaison sans
   * prix pro, d'audience publique ou en attente de validation pro n'arrive pas
   * jusqu'ici : `listSellable("pro")` l'écarte déjà (Q3 a).
   */
  async all(): Promise<readonly CatalogItem[]> {
    // `pro` : ce lecteur sert le canal professionnel, pas la vitrine publique.
    const items = await this.catalog.listSellable("pro");
    return items
      .filter(isShownAsTile)
      .map((item) => toCatalogItem(item))
      .sort(byFamilyThenName);
  }
}

/**
 * L'article du checkout, **avec la famille que le référentiel lui donne**.
 *
 * Régression du 2026-09-26 : une table de rayons en dur ne connaissait pas une
 * famille créée au PIM, et tout ce qui lit le catalogue pro est tombé en 500.
 * La famille est désormais une donnée reçue : il n'y a plus rien à traduire,
 * donc plus rien qui puisse manquer.
 */
function toCatalogItem(item: ResolvedCatalogItem): CatalogItem {
  return {
    // Le SKU de VENTE : celui du produit pour le défaut — l'identifiant que la
    // boutique porte déjà —, le sien pour une autre déclinaison.
    sku: shopSkuOf(item),
    name: item.name,
    unitPriceMillicents: item.unitPriceMillicents,
    vatRate: item.vatRate,
    // Transporté TEL QUEL, sans défaut : ce que le checkout figera sur la ligne
    // doit être ce que le référentiel déclare, ou rien.
    allergens: item.allergens,
    orderTimeLimit: item.orderTimeLimit,
    family: item.family,
    saleUnit: item.saleUnit,
    weightMinGrams: item.weightMinGrams,
    weightStepGrams: item.weightStepGrams,
    minQuantities: item.minQuantities,
    // 🔴 La frappe, ici et pas ailleurs : c'est l'endroit qui vient de LIRE le
    // catalogue. Le prix scellé ne peut donc pas venir d'un appelant.
    article: catalogueArticle({
      sku: shopSkuOf(item),
      name: item.name,
      categoryPath: item.family.path,
      unitPriceMillicents: item.unitPriceMillicents,
      saleUnit: item.saleUnit,
    }),
  };
}

/** L'ordre du référentiel d'abord, l'alphabet ensuite. */
function byFamilyThenName(left: CatalogItem, right: CatalogItem): number {
  const families = compareFamilies(left.family, right.family);
  return families === 0 ? left.name.localeCompare(right.name, "fr") : families;
}
