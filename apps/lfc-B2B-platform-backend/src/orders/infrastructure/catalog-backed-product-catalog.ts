import { CATALOG_CATEGORY_ORDER, type CatalogCategory } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../catalog/domain/ports/catalog.reader.js";
import { UnknownCatalogShelfError } from "../domain/errors/unknown-catalog-shelf.error.js";
import { ProductCatalogReader, type CatalogItem } from "../domain/ports/product-catalog.reader.js";

/**
 * **Le rayon d'une famille du PIM.**
 *
 * Le PIM range en familles (`cat_vien`), la boutique range en rayons
 * (`viennoiserie`). Les deux vocabulaires ne se déduisent pas l'un de l'autre :
 * il faut une table, et elle est ici, explicite, plutôt que devinée d'un
 * préfixe de SKU comme le faisait le seed.
 *
 * La correspondance a été vérifiée sur la donnée avant la bascule — les
 * effectifs coïncident un pour un (19 / 18 / 18 / 24 / 13). Ce n'est pas une
 * hypothèse, c'est un constat.
 *
 * ⚠️ Le rayon est une **union fermée** dans les contrats : tant qu'elle l'est,
 * une famille inédite poussée par le PIM n'a pas de rayon, et c'est un refus
 * explicite (cf. {@link UnknownCatalogShelfError}) plutôt qu'un article rangé
 * au hasard. Un rayon faux ferait appliquer les règles de prix d'une AUTRE
 * famille — donc facturer un prix que personne n'a décidé.
 */
const SHELF_BY_PIM_CATEGORY: Readonly<Record<string, CatalogCategory>> = {
  cat_vien: "viennoiserie",
  cat_pains: "pain",
  cat_patis: "patisserie",
  cat_sale: "sale",
  cat_choco: "chocolat",
};

/**
 * **L'autorité de prix du checkout, branchée sur la base.**
 *
 * Remplace `SeededProductCatalog`, dont le prix était une constante compilée :
 * l'écran de tarification comme la frise résolvaient donc de vraies décisions
 * contre des tarifs figés, et historiser ce canonique n'aurait rien historisé.
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
  const shelf = SHELF_BY_PIM_CATEGORY[item.categoryId];
  if (shelf === undefined) {
    throw new UnknownCatalogShelfError(item.sku, item.categoryId);
  }
  return {
    // Le SKU du PRODUIT : c'est l'identifiant que la boutique porte déjà.
    sku: item.productSku,
    name: item.name,
    unitPriceCents: item.unitPriceCents,
    vatRate: item.vatRate,
    category: shelf,
  };
}

/** L'ordre de la vitrine d'abord, l'alphabet ensuite — celui du seed. */
function byShelfThenName(left: CatalogItem, right: CatalogItem): number {
  const shelves =
    CATALOG_CATEGORY_ORDER.indexOf(left.category) - CATALOG_CATEGORY_ORDER.indexOf(right.category);
  return shelves === 0 ? left.name.localeCompare(right.name, "fr") : shelves;
}
