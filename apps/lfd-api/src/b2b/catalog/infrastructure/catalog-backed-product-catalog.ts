import { CATALOG_CATEGORY_ORDER } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { CatalogReader, type ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";
import { catalogueArticle } from "../domain/catalogue-article.js";
import { shelfOfCategory } from "../domain/shelf-of-category.js";
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
 * Les autres déclinaisons (un carton, un futur conditionnement) restent
 * invisibles ici : la boutique n'a jamais su les vendre. Elles s'ouvriront avec
 * le front client, à la slice C7.
 */
@Injectable()
export class CatalogBackedProductCatalog extends ProductCatalogReader {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async resolve(sku: string): Promise<CatalogItem | null> {
    const item = await this.catalog.findDefaultByProductSku(sku);
    return item === null ? null : toCatalogItem(item);
  }

  async resolveMany(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogItem>> {
    const items = await this.catalog.listDefaultsByProductSkus(skus);
    const found = new Map<string, CatalogItem>();
    for (const [productSku, item] of items) {
      found.set(productSku, toCatalogItem(item));
    }
    return found;
  }

  /**
   * Le catalogue vendable, **rangé comme la vitrine** : rayon dans l'ordre
   * déclaré, puis alphabétique. Le même ordre que le seed rendait, pour que
   * l'écran de tarification ne se réorganise pas le jour de la bascule.
   */
  async all(): Promise<readonly CatalogItem[]> {
    const items = await this.catalog.listSellable();
    return items
      .filter((item) => item.isDefault)
      .map(toCatalogItem)
      .sort(byShelfThenName);
  }
}

/**
 * @throws {UnknownCatalogShelfError} la famille du PIM n'a pas de rayon.
 *   Refusé plutôt que rangé par défaut : un rayon faux fait appliquer les règles
 *   de prix d'une autre famille, et personne ne s'en aperçoit avant la facture.
 */
function toCatalogItem(item: ResolvedCatalogItem): CatalogItem {
  // La table des rayons est chez `catalog/` depuis le 2026-09-09 : la vitrine
  // en a besoin aussi pour tarifer, et elle ne peut pas remonter jusqu'ici.
  const shelf = shelfOfCategory(item.sku, item.categoryId);
  return {
    // Le SKU du PRODUIT : c'est l'identifiant que la boutique porte déjà.
    sku: item.productSku,
    name: item.name,
    unitPriceMillicents: item.unitPriceMillicents,
    vatRate: item.vatRate,
    // Transporté TEL QUEL, sans défaut : ce que le checkout figera sur la ligne
    // doit être ce que le référentiel déclare, ou rien.
    allergens: item.allergens,
    orderTimeLimit: item.orderTimeLimit,
    category: shelf,
    // 🔴 La frappe, ici et pas ailleurs : c'est l'endroit qui vient de LIRE le
    // catalogue. Le prix scellé ne peut donc pas venir d'un appelant.
    article: catalogueArticle({
      sku: item.productSku,
      name: item.name,
      category: shelf,
      unitPriceMillicents: item.unitPriceMillicents,
    }),
  };
}

/** L'ordre de la vitrine d'abord, l'alphabet ensuite — celui du seed. */
function byShelfThenName(left: CatalogItem, right: CatalogItem): number {
  const shelves =
    CATALOG_CATEGORY_ORDER.indexOf(left.category) - CATALOG_CATEGORY_ORDER.indexOf(right.category);
  return shelves === 0 ? left.name.localeCompare(right.name, "fr") : shelves;
}
