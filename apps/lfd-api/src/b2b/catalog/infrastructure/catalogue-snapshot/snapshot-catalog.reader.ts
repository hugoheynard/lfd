import { Injectable } from "@nestjs/common";

import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";
import { viewerHolderIds, type CatalogViewer } from "../../domain/catalog-viewer.js";
import { isShownAsTile } from "../../domain/shop-sku.js";
import { PrismaCatalogReader, servedItem } from "../prisma-catalog.reader.js";
import { CatalogueSnapshotStore, type RequestReservations } from "./catalogue-snapshot.store.js";
import type { SnapshotArticleRow, SnapshotArticles } from "./catalogue-snapshot.loader.js";

/** Ce qu'une lecture de l'instantané réunit : le morceau, et les réservations de la requête. */
interface SnapshotRead {
  readonly articles: SnapshotArticles;
  readonly reservations: RequestReservations;
}

/**
 * **`CatalogReader` sur l'instantané** (plan des matériaux du catalogue,
 * § 2.4, lectures A et B) — et sur la base, comme avant, hors de la portée
 * de l'instantané ({@link CatalogueSnapshotStore.serves}).
 *
 * Les vues ne réécrivent aucune règle : chaque ligne passe par `servedItem`
 * (le mur, l'audience, le prix servi), avec la liste des réservations de la
 * requête à la place de la relation filtrée en SQL. Ce qui est propre à une
 * lecture de la base est réappliqué ici, et seulement ça : `STILL_SOLD` est
 * déjà dans l'instantané ; la lecture A garde son filtre du taux et son tri
 * (§ 9) ; B et `findByShopSku` gardent la règle des SKU de vente
 * (`soldUnderShopSkus` : le défaut, ou une déclinaison en vignette).
 */
@Injectable()
export class SnapshotCatalogReader extends CatalogReader {
  constructor(
    private readonly base: PrismaCatalogReader,
    private readonly store: CatalogueSnapshotStore,
  ) {
    super();
  }

  async listSellable(viewer: CatalogViewer): Promise<ResolvedCatalogItem[]> {
    if (!this.store.serves()) {
      return this.base.listSellable(viewer);
    }
    const read = await this.read(viewer);
    // Le mur du taux de la lecture A : l'ARTICLE sans taux ne se vend pas,
    // même au public (`vatRatePercent: { not: null }`). Les lignes sont déjà
    // dans l'ordre à trois clés.
    return read.articles.rows.flatMap((row) => {
      const item = row.vatRatePercent === null ? null : this.serve(row, viewer, read);
      return item === null ? [] : [item];
    });
  }

  async findByShopSku(shopSku: string, viewer: CatalogViewer): Promise<ResolvedCatalogItem | null> {
    if (!this.store.serves()) {
      return this.base.findByShopSku(shopSku, viewer);
    }
    const read = await this.read(viewer);
    const row = soldUnder(read.articles, shopSku);
    return row === null ? null : this.serve(row, viewer, read);
  }

  async listByShopSkus(
    shopSkus: readonly string[],
    viewer: CatalogViewer,
  ): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    if (!this.store.serves()) {
      return this.base.listByShopSkus(shopSkus, viewer);
    }
    if (shopSkus.length === 0) {
      return new Map();
    }
    const read = await this.read(viewer);
    const resolved = new Map<string, ResolvedCatalogItem>();
    for (const shopSku of new Set(shopSkus)) {
      const row = soldUnder(read.articles, shopSku);
      const item = row === null ? null : this.serve(row, viewer, read);
      if (item !== null) {
        resolved.set(shopSku, item);
      }
    }
    return resolved;
  }

  /** 🔴 Les réservations de l'appelant D'ABORD, l'instantané ensuite (§ 9). */
  private async read(viewer: CatalogViewer): Promise<SnapshotRead> {
    const reservations = await this.store.reservationsFor(viewerHolderIds(viewer));
    const articles = await this.store.articles();
    return { articles, reservations };
  }

  private serve(
    row: SnapshotArticleRow,
    viewer: CatalogViewer,
    read: SnapshotRead,
  ): ResolvedCatalogItem | null {
    const reservations = read.reservations.get(row.sku) ?? [];
    return servedItem({ ...row, reservations }, viewer, read.articles.lineage);
  }
}

/** L'article vendu sous ce SKU de vente — `soldUnderShopSkus`, sur l'index. */
function soldUnder(articles: SnapshotArticles, shopSku: string): SnapshotArticleRow | null {
  const row = articles.bySku.get(shopSku);
  return row !== undefined && isShownAsTile(row) ? row : null;
}
