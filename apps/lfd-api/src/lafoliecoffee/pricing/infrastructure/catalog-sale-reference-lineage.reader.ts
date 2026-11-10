import { Injectable } from "@nestjs/common";

import { DetachmentOriginReader } from "../../catalog/domain/ports/detachment-origin.reader.js";
import { SaleReferenceLineageReader } from "../domain/ports/sale-reference-lineage.reader.js";

/** La filiation lue au catalogue du commerce, où le fait de la fiche l'a descendue. */
@Injectable()
export class CatalogSaleReferenceLineageReader extends SaleReferenceLineageReader {
  constructor(private readonly catalog: DetachmentOriginReader) {
    super();
  }

  detachedFromOf(shopSku: string): Promise<string | null> {
    return this.catalog.detachedFromOf(shopSku);
  }
}
