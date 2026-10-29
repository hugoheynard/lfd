import { Injectable } from "@nestjs/common";

import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import { WithdrawnShopSkusReader } from "../../catalog/domain/ports/withdrawn-shop-skus.reader.js";
import {
  SaleReferenceReader,
  type SaleReferenceStanding,
} from "../domain/ports/sale-reference.reader.js";

/**
 * Les références de vente, lues par **le chemin de la caisse** :
 * `resolveMany`, qui résout un SKU de vente comme la commande le fera.
 *
 * Les DEUX clientèles : une règle peut viser le public, une mercuriale le pro,
 * et le geste refuse ce qui ne se vend à personne — pas ce qui ne se vend pas
 * à la clientèle de la décision (cf. le rapport du lot L5). Ce qui n'est
 * vendu à personne est ensuite cherché parmi les retirés, pour que le refus
 * dise lequel des deux cas c'est.
 */
@Injectable()
export class CatalogSaleReferenceReader extends SaleReferenceReader {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly withdrawn: WithdrawnShopSkusReader,
  ) {
    super();
  }

  async standingOf(
    shopSkus: readonly string[],
  ): Promise<ReadonlyMap<string, SaleReferenceStanding>> {
    const [pro, open] = await Promise.all([
      this.catalog.resolveMany(shopSkus, "pro"),
      this.catalog.resolveMany(shopSkus, "public"),
    ]);
    const standings = new Map<string, SaleReferenceStanding>();
    for (const sku of shopSkus) {
      if (pro.has(sku) || open.has(sku)) {
        standings.set(sku, "on_sale");
      }
    }
    const missing = shopSkus.filter((sku) => !standings.has(sku));
    for (const sku of await this.withdrawn.withdrawnAmong(missing)) {
      standings.set(sku, "withdrawn");
    }
    return standings;
  }
}
