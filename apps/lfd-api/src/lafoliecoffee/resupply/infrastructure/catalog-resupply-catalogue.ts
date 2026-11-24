import { Injectable } from "@nestjs/common";
import { isShownAsTile, shopSkuOf } from "../../catalog/domain/shop-sku.js";

import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../catalog/domain/ports/catalog.reader.js";
import { type ResupplyArticle, ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { staffViewer } from "../../catalog/domain/catalog-viewer.js";
import { ResupplyOnlyArticlesReader } from "../../catalog/domain/ports/resupply-only-articles.reader.js";

/** La vitrine sert les particuliers : c'est leur catalogue qu'elle reçoit. */
const SHOP_AUDIENCE = "public";

/**
 * **Le catalogue publié, vu du réapprovisionnement** — sur `CatalogReader`
 * (la copie que le commerce tient du référentiel, par son canal). Le SKU du
 * PRODUIT, celui que portent les lignes de commande ; aucun prix ne traverse.
 *
 * **Un seul critère pour proposer et pour valider : celui du rayon**
 * (`isShownAsTile` — le défaut, ou une déclinaison d'une fiche en vignette ;
 * décision E4 de l'audit final, 2026-11-03). La liste ne proposait que le
 * défaut, et la validation acceptait toute déclinaison vendue : un SKU d'une
 * déclinaison masquée passait par l'API, une déclinaison en vignette que la
 * vitrine vend n'était pas proposée.
 *
 * **Plus les articles réservés au réassort** (audience `resupply`, le cookie
 * des formules — `plan-articles-de-reassort.md`), qu'aucune vitrine ne sert :
 * le catalogue les lit par sa lecture nommée, et chacun se range à la suite
 * des articles publics de sa famille.
 */
@Injectable()
export class CatalogResupplyCatalogue extends ResupplyCatalogue {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly resupplyOnly: ResupplyOnlyArticlesReader,
  ) {
    super();
  }

  async articles(): Promise<readonly ResupplyArticle[]> {
    // Un article au poids est proposé depuis le réassort des articles au poids (L2b-4) : chaque
    // article porte son unité, et les écrans saisissent ses quantités en grammes.
    const [items, resupplyOnly] = await Promise.all([
      this.catalog.listSellable(staffViewer(SHOP_AUDIENCE)),
      this.resupplyOnly.articles(),
    ]);
    return withinFamilies(items.filter(isShownAsTile).map(toArticle), resupplyOnly);
  }

  async article(sku: string): Promise<ResupplyArticle | null> {
    const item = await this.catalog.findByShopSku(sku, staffViewer(SHOP_AUDIENCE));
    if (item !== null && isShownAsTile(item)) {
      return toArticle(item);
    }
    return this.resupplyOnly.article(sku);
  }
}

function toArticle(item: ResolvedCatalogItem): ResupplyArticle {
  return {
    sku: shopSkuOf(item),
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    saleUnit: item.saleUnit,
  };
}

/**
 * Range chaque article réservé au réassort après le dernier article public de
 * sa famille, ou à la fin si sa famille n'en a aucun : le comptoir lit sa
 * table famille par famille.
 */
export function withinFamilies(
  shop: readonly ResupplyArticle[],
  resupplyOnly: readonly ResupplyArticle[],
): readonly ResupplyArticle[] {
  const merged = [...shop];
  for (const article of resupplyOnly) {
    const last = merged.findLastIndex((candidate) => candidate.categoryId === article.categoryId);
    merged.splice(last === -1 ? merged.length : last + 1, 0, article);
  }
  return merged;
}
