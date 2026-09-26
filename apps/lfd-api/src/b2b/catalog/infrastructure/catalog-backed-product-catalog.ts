import { CATALOG_CATEGORY_ORDER, type CatalogCategory } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../domain/ports/catalog.reader.js";
import { catalogueArticle } from "../domain/catalogue-article.js";
import { UnknownCatalogShelfError } from "../domain/errors/unknown-catalog-shelf.error.js";
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
  private readonly logger = new Logger(CatalogBackedProductCatalog.name);

  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async resolve(sku: string, audience: ShopAudience): Promise<CatalogItem | null> {
    const item = await this.catalog.findDefaultByProductSku(sku, audience);
    return item === null ? null : this.toCatalogItem(item);
  }

  async resolveMany(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, CatalogItem>> {
    const items = await this.catalog.listDefaultsByProductSkus(skus, audience);
    const found = new Map<string, CatalogItem>();
    for (const [productSku, item] of items) {
      found.set(productSku, this.toCatalogItem(item));
    }
    return found;
  }

  /**
   * Le catalogue vendable, **rangé comme la vitrine** : rayon dans l'ordre
   * déclaré, puis alphabétique. Le même ordre que le seed rendait, pour que
   * l'écran de tarification ne se réorganise pas le jour de la bascule.
   */
  async all(): Promise<readonly CatalogItem[]> {
    // `pro` : ce lecteur sert le canal professionnel, pas la vitrine publique.
    const items = await this.catalog.listSellable("pro");
    return items
      .filter((item) => item.isDefault)
      .map((item) => this.toCatalogItem(item))
      .sort(byShelfThenName);
  }

  /**
   * L'article du checkout — et, pour une famille sans rayon, un article
   * **sans famille** plutôt qu'un refus.
   *
   * Régression du 2026-09-26 : une seconde famille « Viennoiseries » créée au
   * PIM n'avait pas de rayon, `shelfOfCategory` a levé, et tout ce qui lit le
   * catalogue pro est tombé en 500. Écarter l'article aurait cassé le brouillon,
   * l'abonnement et le devis qui le portent. Il est donc tarifé sans décision
   * de famille — un rayon ABSENT, jamais un rayon deviné.
   *
   * Un avertissement au log, pas un fait du journal : une lecture n'écrit rien.
   */
  private toCatalogItem(item: ResolvedCatalogItem): CatalogItem {
    const shelf = shelfOrNull(item.sku, item.categoryId);
    if (shelf === null) {
      this.logger.warn(
        `Article ${item.productSku} (déclinaison ${item.sku}) : la famille ${item.categoryId} ` +
          "n'a pas de rayon côté commerce — tarifé sans décision de famille. " +
          "Rattacher l'article à une famille connue dans le référentiel.",
      );
    }
    return toCatalogItem(item, shelf);
  }
}

/** Le rayon, ou `null` pour une famille que la boutique ne sait pas ranger. */
function shelfOrNull(sku: string, categoryId: string): CatalogCategory | null {
  try {
    return shelfOfCategory(sku, categoryId);
  } catch (error) {
    if (error instanceof UnknownCatalogShelfError) {
      return null;
    }
    throw error;
  }
}

/**
 * `shelf` à `null` : famille sans rayon. Jamais rangé par défaut — un rayon faux
 * fait appliquer les règles de prix d'une autre famille, et personne ne s'en
 * aperçoit avant la facture.
 */
function toCatalogItem(item: ResolvedCatalogItem, shelf: CatalogCategory | null): CatalogItem {
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

/**
 * L'ordre de la vitrine d'abord, l'alphabet ensuite — celui du seed. Les
 * articles sans famille connue viennent en dernier.
 */
function byShelfThenName(left: CatalogItem, right: CatalogItem): number {
  const shelves = shelfRank(left.category) - shelfRank(right.category);
  return shelves === 0 ? left.name.localeCompare(right.name, "fr") : shelves;
}

function shelfRank(category: CatalogCategory | null): number {
  return category === null
    ? CATALOG_CATEGORY_ORDER.length
    : CATALOG_CATEGORY_ORDER.indexOf(category);
}
