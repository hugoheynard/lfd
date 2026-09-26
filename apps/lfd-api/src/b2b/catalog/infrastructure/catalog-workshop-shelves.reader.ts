import type { CatalogFamilyView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { WorkshopShelvesReader } from "../../../production/channels/commerce/index.js";
import { familyView } from "../domain/catalog-family.js";
import { CatalogReader } from "../domain/ports/catalog.reader.js";

/**
 * **Le rayon des articles du fournil**, lu dans le miroir du catalogue.
 *
 * ## Pourquoi sur `CatalogReader` et non sur `ProductCatalogReader.resolveMany`
 *
 * On lit la même source que `resolveMany` (`listDefaultsByProductSkus`, même
 * SKU produit, mêmes filtres), en une requête, sans sceller de prix dont la
 * fiche n'a que faire. Le rayon est la famille du référentiel telle que le
 * miroir la porte : plus de table de traduction, donc plus d'article orphelin
 * pour une famille que le code ne connaîtrait pas (panne du 2026-09-26).
 *
 * ## Ce qui n'est PAS rattrapé
 *
 * Toute erreur — la base qui ne répond pas — remonte : c'est au handler de la
 * fiche de la journaliser et de servir « Rayon inconnu ». Avaler une panne ici
 * la déguiserait en « hors catalogue », ce qui affirmerait un fait faux.
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

  async shelvesOf(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    const items = await this.catalog.listDefaultsByProductSkus(skus, "pro");
    const shelves = new Map<string, CatalogFamilyView>();
    for (const [productSku, item] of items) {
      shelves.set(productSku, familyView(item.family));
    }
    return shelves;
  }
}
