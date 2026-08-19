import { Injectable } from "@nestjs/common";

import { B2bCatalogFeedPreview } from "../../../pim/channels/b2b-platform/products/feed-preview.js";
import { compareToReference, type ParityReport } from "../domain/catalog-parity.js";
import { CatalogReader } from "../domain/ports/catalog.reader.js";

/**
 * Confronte le miroir de la plateforme à ce que le référentiel publierait.
 *
 * Les deux lectures sont **réelles** : la projection telle que le fil
 * l'enverrait, et le catalogue tel que la boutique le lit. Comparer deux
 * requêtes plus simples prouverait que deux tables se ressemblent, pas que la
 * caisse rendrait la même monnaie.
 *
 * L'instant est pris **une seule fois** et traverse la projection : deux
 * `new Date()` dans la même opération dériveraient de quelques millisecondes,
 * et le snapshot porterait un instant qui n'est celui de rien.
 */
@Injectable()
export class CheckCatalogParityService {
  constructor(
    private readonly feed: B2bCatalogFeedPreview,
    private readonly catalog: CatalogReader,
  ) {}

  async check(): Promise<ParityReport> {
    const [preview, mirror] = await Promise.all([
      this.feed.preview(new Date().toISOString()),
      this.catalog.listSellable(),
    ]);

    const reference = preview.snapshot.products.flatMap((product) =>
      product.variants.map((variant) => ({
        sku: variant.sku,
        name: variant.name,
        priceCents: variant.priceCents,
      })),
    );

    return compareToReference(
      reference,
      mirror.map((item) => ({
        sku: item.sku,
        name: item.name,
        pimPriceCents: item.pimPriceCents,
      })),
    );
  }
}
