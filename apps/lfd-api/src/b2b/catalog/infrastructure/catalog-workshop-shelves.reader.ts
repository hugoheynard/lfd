import type { CatalogCategory } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { WorkshopShelvesReader } from "../../../production/channels/commerce/index.js";
import { UnknownCatalogShelfError } from "../domain/errors/unknown-catalog-shelf.error.js";
import { CatalogReader } from "../domain/ports/catalog.reader.js";
import { shelfOfCategory } from "../domain/shelf-of-category.js";

/**
 * **Le rayon des articles du fournil**, lu dans le miroir du catalogue.
 *
 * ## Pourquoi sur `CatalogReader` et non sur `ProductCatalogReader.resolveMany`
 *
 * `resolveMany` convertit chaque article par `toCatalogItem`, qui LÈVE
 * `UnknownCatalogShelfError` pour une famille sans rayon — et sa boucle ne
 * rattrape rien : un seul article orphelin faisait tomber tout le lot (vérifié
 * le 2026-09-14). Un repli article par article aurait ajouté une requête par
 * SKU précisément le jour où le catalogue dérive. On lit donc la même source que
 * `resolveMany` (`listDefaultsByProductSkus`, même SKU produit, mêmes filtres),
 * en une requête, et on ne traduit que la famille — sans sceller de prix dont la
 * fiche n'a que faire.
 *
 * ## Ce qui n'est PAS rattrapé
 *
 * Seul `UnknownCatalogShelfError` rend un SKU absent. Toute autre erreur — la
 * base qui ne répond pas — remonte : c'est au handler de la fiche de la
 * journaliser et de servir « Rayon inconnu ». Avaler une panne ici la
 * déguiserait en « hors catalogue », ce qui affirmerait un fait faux.
 *
 * ⚠️ `listDefaultsByProductSkus` écarte les articles **masqués** et sans taux de
 * TVA (vérifié le 2026-09-14 dans `PrismaCatalogReader`) : un article fabriqué
 * mais masqué à la vente tombe donc dans « Hors catalogue ».
 */
@Injectable()
export class CatalogWorkshopShelvesReader extends WorkshopShelvesReader {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async shelvesOf(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogCategory>> {
    const items = await this.catalog.listDefaultsByProductSkus(skus);
    const shelves = new Map<string, CatalogCategory>();
    for (const [productSku, item] of items) {
      const shelf = shelfOrNull(productSku, item.categoryId);
      if (shelf !== null) {
        shelves.set(productSku, shelf);
      }
    }
    return shelves;
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
