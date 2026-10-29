import { Injectable } from "@nestjs/common";

import {
  type SellableArticle,
  SellableArticlesReader,
} from "../../../production/channels/commerce/index.js";
import { compareFamilies } from "../domain/catalog-family.js";
import { CatalogReader, type ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";

/**
 * **Les articles vendables, pour les raccourcis du fournil** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, §3), lus dans le
 * miroir du catalogue par `CatalogReader.listSellable`.
 *
 * Le fournil fabrique pour les pros ET pour la vitrine : on lit les deux
 * audiences, et un produit vendu aux deux ne paraît qu'une fois, sous le SKU
 * de VENTE de son défaut (`shopSkuOf`, la seule règle — le SKU produit tant
 * que la bascule de `plan-defaut-sous-sa-reference.md` n'est pas faite) et
 * son unité par défaut — la clé des lignes de la fiche d'atelier.
 *
 * L'ordre est celui du catalogue : les familles par position, et dans chaque
 * famille l'ordre de la lecture pro, puis les articles vendus seulement au
 * public (le tri est stable). `listSellable` trie déjà par famille, position
 * et SKU (vérifié le 2026-10-28 dans `PrismaCatalogReader`).
 *
 * Toute panne remonte : la page dit qu'elle n'a pas pu lire.
 */
@Injectable()
export class CatalogSellableArticlesReader extends SellableArticlesReader {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async sellableArticles(): Promise<readonly SellableArticle[]> {
    const [pro, shop] = await Promise.all([
      this.catalog.listSellable("pro"),
      this.catalog.listSellable("public"),
    ]);
    const byProduct = new Map<string, ResolvedCatalogItem>();
    for (const item of [...pro, ...shop]) {
      if (item.isDefault && !byProduct.has(shopSkuOf(item))) {
        byProduct.set(shopSkuOf(item), item);
      }
    }
    return [...byProduct.values()]
      .sort((left, right) => compareFamilies(left.family, right.family))
      .map((item) => ({
        sku: shopSkuOf(item),
        name: item.name,
        familyId: item.family.id,
        familyName: item.family.name,
        saleUnit: item.saleUnit,
      }));
  }
}
