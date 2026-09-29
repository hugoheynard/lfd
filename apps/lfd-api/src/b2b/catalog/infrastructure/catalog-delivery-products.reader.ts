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
 * Sur `ProductCatalogReader.all()` : le catalogue PRO vendable, unités par
 * défaut, sous le SKU du PRODUIT — celui que portent les lignes de commande,
 * donc celui que le colisage comparera. Rangé comme le référentiel. Aucun
 * prix ne traverse : la livraison n'en a que faire.
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
    const [items, cold] = await Promise.all([this.catalog.all(), this.cold.coldProductSkus()]);
    return items.map((item) => ({
      sku: item.sku,
      name: item.name,
      // Le froid de la fiche (fil v12), sous le même SKU produit.
      requiresCold: cold.has(item.sku),
    }));
  }
}
