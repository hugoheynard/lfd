import { Injectable } from "@nestjs/common";

import {
  CatalogReader,
  type ResolvedCatalogItem,
  type ShopAudience,
} from "../domain/ports/catalog.reader.js";
import { catalogueArticle } from "../domain/catalogue-article.js";
import { compareFamilies } from "../domain/catalog-family.js";
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

  async resolve(sku: string, audience: ShopAudience): Promise<CatalogItem | null> {
    const item = await this.catalog.findDefaultByProductSku(sku, audience);
    return item === null ? null : toCatalogItem(item);
  }

  async resolveMany(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, CatalogItem>> {
    const items = await this.catalog.listDefaultsByProductSkus(skus, audience);
    const found = new Map<string, CatalogItem>();
    for (const [productSku, item] of items) {
      found.set(productSku, toCatalogItem(item));
    }
    return found;
  }

  /**
   * Le catalogue vendable, **rangé comme le référentiel** : la position de la
   * famille, puis l'alphabet. Plus d'ordre des rayons dans le code — celui du
   * PIM fait foi, et une famille nouvelle y prend sa place sans déploiement.
   */
  async all(): Promise<readonly CatalogItem[]> {
    // `pro` : ce lecteur sert le canal professionnel, pas la vitrine publique.
    const items = await this.catalog.listSellable("pro");
    return items
      .filter((item) => item.isDefault)
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
    // Le SKU du PRODUIT : c'est l'identifiant que la boutique porte déjà.
    sku: item.productSku,
    name: item.name,
    unitPriceMillicents: item.unitPriceMillicents,
    vatRate: item.vatRate,
    // Transporté TEL QUEL, sans défaut : ce que le checkout figera sur la ligne
    // doit être ce que le référentiel déclare, ou rien.
    allergens: item.allergens,
    orderTimeLimit: item.orderTimeLimit,
    family: item.family,
    // 🔴 La frappe, ici et pas ailleurs : c'est l'endroit qui vient de LIRE le
    // catalogue. Le prix scellé ne peut donc pas venir d'un appelant.
    article: catalogueArticle({
      sku: item.productSku,
      name: item.name,
      categoryPath: item.family.path,
      unitPriceMillicents: item.unitPriceMillicents,
    }),
  };
}

/** L'ordre du référentiel d'abord, l'alphabet ensuite. */
function byFamilyThenName(left: CatalogItem, right: CatalogItem): number {
  const families = compareFamilies(left.family, right.family);
  return families === 0 ? left.name.localeCompare(right.name, "fr") : families;
}
