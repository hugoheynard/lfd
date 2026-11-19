import { Injectable } from "@nestjs/common";

import {
  MediaCarriers,
  type Carrier,
  type ImageReplacement,
} from "../media/channels/carriers/media-carriers.js";
import type { WriteTicket } from "../platform/journal/scoped-journal.js";
import { CategoryImageHolders } from "../pim/catalogue/category/domain/ports/category-image-holders.js";
import { CategoryImageRepointing } from "../pim/catalogue/category/domain/ports/category-image-repointing.js";
import { ProductImageHolders } from "../pim/catalogue/product/domain/ports/product-image-holders.js";
import { ProductImageRepointing } from "../pim/catalogue/product/domain/ports/product-image-repointing.js";

/**
 * Ce que le RÉFÉRENTIEL répond à la médiathèque : quelles fiches et quelles
 * familles affichent chacune de ces images.
 *
 * Il ne lit aucune table : il compose ce que la fiche et la famille publient
 * chacune pour leurs propres images. Les DEUX porteurs, toujours — l'oubli
 * d'un seul ferait proposer de supprimer une image qu'une famille affiche.
 *
 * Le remplacement délègue aussi à chaque propriétaire : seul celui qui écrit
 * ses visuels sait les repointer. Pas de réannonce ici : la médiathèque publie
 * dans la même transaction `media.asset_described` sur `to`, que le
 * référentiel écoute déjà (`product/media/on-media-asset-described.ts`).
 */
@Injectable()
export class PimCatalogueMediaCarriers extends MediaCarriers {
  constructor(
    private readonly products: ProductImageHolders,
    private readonly categories: CategoryImageHolders,
    private readonly productRepointing: ProductImageRepointing,
    private readonly categoryRepointing: CategoryImageRepointing,
  ) {
    super();
  }

  async usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const [byProduct, byCategory] = await Promise.all([
      this.products.usesOf(urls),
      this.categories.usesOf(urls),
    ]);
    const counts = new Map(byProduct);
    for (const [url, uses] of byCategory) {
      counts.set(url, (counts.get(url) ?? 0) + uses);
    }
    return counts;
  }

  /** Les fiches d'abord : c'est le cas fréquent, et l'ordre est celui de la recherche. */
  async carriersOf(url: string): Promise<readonly Carrier[]> {
    const [products, categories] = await Promise.all([
      this.products.holdersOf(url),
      this.categories.holdersOf(url),
    ]);
    return [
      ...products.map((holder): Carrier => ({ kind: "product", ...holder })),
      ...categories.map((holder): Carrier => ({ kind: "category", ...holder })),
    ];
  }

  /**
   * Le laissez-passer n'est pas LU : sa seule existence prouve que la
   * médiathèque a tracé le remplacement (`media_asset.replaced`) dans la même
   * transaction, et le port l'exige pour qu'une écriture sans trace soit
   * inexprimable.
   */
  async repoint({ from, to }: ImageReplacement, ticket: WriteTicket): Promise<number> {
    void ticket;
    const products = await this.productRepointing.repoint(from, to);
    const categories = await this.categoryRepointing.repoint(from, to);
    return products + categories;
  }
}
