import { Injectable } from "@nestjs/common";

import { SaleReferenceLineageReader } from "../../catalog/domain/ports/sale-reference-lineage.reader.js";
import { SkuLineageReader } from "../domain/ports/sku-lineage.reader.js";

/** La lignée lue au catalogue du commerce, où le fait de la fiche l'a descendue. */
@Injectable()
export class CatalogSkuLineageReader extends SkuLineageReader {
  constructor(private readonly catalog: SaleReferenceLineageReader) {
    super();
  }

  ancestorsOf(skus: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
    return this.catalog.ancestorsOf(skus);
  }
}
