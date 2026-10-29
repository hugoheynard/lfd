import { Injectable } from "@nestjs/common";

import {
  type DeliveryProduct,
  DeliveryProductsReader,
} from "../../../delivery/channels/commerce/index.js";
import { CatalogColdReader } from "../domain/ports/catalog-cold.reader.js";
import { ProductCatalogReader } from "../domain/ports/product-catalog.reader.js";

/**
 * **Les produits vendus, relayés à la livraison** (lot 4 bis, v2-2) — pour la
 * grille des contenances.
 *
 * Sur `ProductCatalogReader.all()` : le catalogue PRO vendable, défauts et
 * déclinaisons montrées en vignette (L4, 2026-10-29), sous leur SKU de vente —
 * la grille règle donc une contenance pour `P-X-2` comme pour `P-X`. Le colisage et la feuille d'arrêt ne le
 * lisent plus pour le froid (`DeliveryColdSkusReader`, toutes déclinaisons).
 * Rangé comme le référentiel. Aucun prix ne traverse : la livraison n'en a que faire.
 */
@Injectable()
export class CatalogDeliveryProductsReader extends DeliveryProductsReader {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly cold: CatalogColdReader,
  ) {
    super();
  }

  async sold(): Promise<readonly DeliveryProduct[]> {
    const [items, cold] = await Promise.all([this.catalog.all(), this.cold.coldShopSkus()]);
    return items.map((item) => ({
      sku: item.sku,
      name: item.name,
      // Le froid de la fiche (fil v12), par SKU de vente : `all()` rend des
      // SKU de vente (`shopSkuOf`), l'ensemble aussi.
      requiresCold: cold.has(item.sku),
    }));
  }
}
