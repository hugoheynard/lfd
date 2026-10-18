import { Injectable } from "@nestjs/common";

import type { ShopAudience } from "../../catalog/domain/ports/catalog.reader.js";
import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import {
  AudienceFamilyReader,
  type AudienceFamily,
} from "../domain/ports/audience-family.reader.js";

/** Le catalogue pro d'abord, puis le public pour ce que le pro ne sert pas. */
const AUDIENCES_IN_ORDER: readonly ShopAudience[] = ["pro", "public"];

/**
 * La famille de chaque article vendu, lue au catalogue servi
 * (`ProductCatalogReader`, exporté par `CatalogModule`). Un article servi à
 * une seule clientèle se lit dans l'autre ; un article que plus aucune ne
 * sert reste absent — « Famille inconnue » au tableau.
 */
@Injectable()
export class CatalogAudienceFamilyReader extends AudienceFamilyReader {
  constructor(private readonly catalog: ProductCatalogReader) {
    super();
  }

  async familiesOf(skus: readonly string[]): Promise<ReadonlyMap<string, AudienceFamily>> {
    const found = new Map<string, AudienceFamily>();
    for (const audience of AUDIENCES_IN_ORDER) {
      const missing = skus.filter((sku) => !found.has(sku));
      if (missing.length === 0) {
        break;
      }
      const served = await this.catalog.resolveMany(missing, audience);
      for (const [sku, item] of served) {
        if (item.family !== null) {
          found.set(sku, { id: item.family.id, name: item.family.name });
        }
      }
    }
    return found;
  }
}
