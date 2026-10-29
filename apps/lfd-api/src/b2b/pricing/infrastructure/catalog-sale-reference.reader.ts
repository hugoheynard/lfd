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
 * Les DEUX clientèles, et laquelle vend : une décision pro exige la vente aux
 * pros (Hugo, 2026-10-29), un plancher public la vente aux particuliers. Ce
 * qui n'est vendu à personne est ensuite cherché parmi les retirés, pour que
 * le refus dise lequel des deux cas c'est.
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
      const standing = standingOf(pro.has(sku), open.has(sku));
      if (standing !== null) {
        standings.set(sku, standing);
      }
    }
    const missing = shopSkus.filter((sku) => !standings.has(sku));
    for (const sku of await this.withdrawn.withdrawnAmong(missing)) {
      standings.set(sku, "withdrawn");
    }
    return standings;
  }
}

function standingOf(toPros: boolean, toPublic: boolean): SaleReferenceStanding | null {
  if (toPros && toPublic) {
    return "on_sale";
  }
  if (toPros) {
    return "pro_only";
  }
  return toPublic ? "public_only" : null;
}
