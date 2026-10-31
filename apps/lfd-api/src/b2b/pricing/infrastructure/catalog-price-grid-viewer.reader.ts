import { Injectable } from "@nestjs/common";

import { CatalogViewers } from "../../catalog/application/catalog-viewers.service.js";
import type { CatalogViewer } from "../../catalog/domain/catalog-viewer.js";
import { PriceGridViewerReader } from "../domain/ports/price-grid-viewer.reader.js";

/** Le lecteur d'une société, par la décision même de la vitrine (`CatalogViewers.forCompany`). */
@Injectable()
export class CatalogPriceGridViewerReader extends PriceGridViewerReader {
  constructor(private readonly viewers: CatalogViewers) {
    super();
  }

  viewerOf(companyId: string): Promise<CatalogViewer> {
    return this.viewers.forCompany(companyId, "served");
  }
}
