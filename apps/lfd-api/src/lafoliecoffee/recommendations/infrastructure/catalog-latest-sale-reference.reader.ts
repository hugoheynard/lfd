import { Injectable } from "@nestjs/common";

import { SaleReferenceSuccessionReader } from "../../catalog/domain/ports/sale-reference-succession.reader.js";
import { LatestSaleReferenceReader } from "../domain/ports/latest-sale-reference.reader.js";

/** La lignée lue au catalogue du commerce, où le fait de la fiche l'a descendue. */
@Injectable()
export class CatalogLatestSaleReferenceReader extends LatestSaleReferenceReader {
  constructor(private readonly catalog: SaleReferenceSuccessionReader) {
    super();
  }

  latestOf(skus: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.catalog.latestOf(skus);
  }
}
