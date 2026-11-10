import { Injectable } from "@nestjs/common";

import { CatalogAdminReader } from "../../catalog/domain/ports/catalog-admin.reader.js";
import { servedToAnyone } from "../../catalog/domain/served-to.js";
import { OperationSaleReader } from "../domain/ports/operation-sale.reader.js";

/**
 * « En vente » lu par le port que le catalogue publie déjà pour l'éditeur de
 * vitrine (`CatalogAdminReader`), et jugé par SA règle (`servedToAnyone`) :
 * deux définitions d'« en vente » finiraient par dire deux choses.
 */
@Injectable()
export class CatalogBackedOperationSaleReader extends OperationSaleReader {
  constructor(private readonly catalog: CatalogAdminReader) {
    super();
  }

  async sellingAmong(skus: readonly string[]): Promise<ReadonlySet<string>> {
    if (skus.length === 0) {
      return new Set();
    }
    const wanted = new Set(skus);
    const lines = await this.catalog.list();
    return new Set(
      lines.filter((line) => wanted.has(line.sku) && servedToAnyone(line)).map((line) => line.sku),
    );
  }
}
