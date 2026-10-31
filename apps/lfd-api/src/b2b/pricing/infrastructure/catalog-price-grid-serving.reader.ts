import { Injectable } from "@nestjs/common";

import { CatalogViewers } from "../../catalog/application/catalog-viewers.service.js";
import { pricingCompanyOf, viewerAudience } from "../../catalog/domain/catalog-viewer.js";
import {
  PriceGridServingReader,
  type PriceGridServing,
} from "../domain/ports/price-grid-serving.reader.js";

/** Pro ou public, par la décision même de la vitrine (`CatalogViewers.forCompany`). */
@Injectable()
export class CatalogPriceGridServingReader extends PriceGridServingReader {
  constructor(private readonly viewers: CatalogViewers) {
    super();
  }

  async servingOf(companyId: string | null): Promise<PriceGridServing> {
    const viewer = await this.viewers.forCompany(companyId, "served");
    return {
      basis: viewerAudience(viewer) === "pro" ? "ht" : "ttc",
      pricingCompanyId: pricingCompanyOf(viewer),
    };
  }
}
