import { Injectable } from "@nestjs/common";

import { DefaultSaleReferenceReader } from "../../domain/ports/default-sale-reference.reader.js";
import { shopSkuOf } from "../../domain/shop-sku.js";
import { PrismaDefaultSaleReferenceReader } from "../prisma-default-sale-reference.reader.js";
import { CatalogueSnapshotStore } from "./catalogue-snapshot.store.js";

/**
 * **Le défaut en vente de chaque fiche, sur l'instantané** (lot M2) — ce que
 * la page publique de la vitrine lit pour ses tuiles. Même règle que la
 * lecture en base : l'article défaut de la fiche, ENCORE VENDU (le morceau
 * `catalog` ne porte que `STILL_SOLD`), sous sa référence de vente. Hors de
 * la portée, la base comme avant.
 */
@Injectable()
export class SnapshotDefaultSaleReferenceReader extends DefaultSaleReferenceReader {
  constructor(
    private readonly base: PrismaDefaultSaleReferenceReader,
    private readonly store: CatalogueSnapshotStore,
  ) {
    super();
  }

  async ofProducts(productSkus: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (!this.store.serves()) {
      return this.base.ofProducts(productSkus);
    }
    if (productSkus.length === 0) {
      return new Map();
    }
    const wanted = new Set(productSkus);
    const { rows } = await this.store.articles();
    const references = new Map<string, string>();
    for (const row of rows) {
      if (row.isDefault && wanted.has(row.productSku)) {
        references.set(row.productSku, shopSkuOf(row));
      }
    }
    return references;
  }
}
