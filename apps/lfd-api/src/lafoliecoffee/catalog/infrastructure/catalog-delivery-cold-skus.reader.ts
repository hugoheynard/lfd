import { Injectable } from "@nestjs/common";

import { DeliveryColdSkusReader } from "../../../delivery/channels/commerce/index.js";
import { CatalogColdReader } from "../domain/ports/catalog-cold.reader.js";

/**
 * **Le froid par SKU de vente, relayé à la livraison** (L0 de
 * `catalogue/plan-pro-voit-les-declinaisons.md`) — pour le colisage et la
 * feuille d'arrêt, qui comparent au SKU d'une ligne de commande. Toutes
 * audiences : une ligne publique arrive au même camion.
 */
@Injectable()
export class CatalogDeliveryColdSkusReader extends DeliveryColdSkusReader {
  constructor(private readonly cold: CatalogColdReader) {
    super();
  }

  coldSkus(): Promise<ReadonlySet<string>> {
    return this.cold.coldShopSkus();
  }
}
