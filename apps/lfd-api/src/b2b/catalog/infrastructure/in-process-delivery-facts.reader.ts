import { Injectable } from "@nestjs/common";

// `b2b` conforme au port publié par `pim`, jamais l'inverse.
import {
  B2bDeliveryFactsReader,
  type SkuDeliveryFacts,
} from "../../../pim/channels/b2b-platform/products/delivery-facts.reader.js";
import { CatalogItemRepository } from "../domain/ports/catalog-item.repository.js";

/**
 * **Ce que la plateforme répond au référentiel** — en processus.
 *
 * Le **miroir** seul dit ce qui a été accepté, et depuis quand les faits en
 * vigueur datent (`receivedAt` porté par l'article).
 *
 * ⚠️ `awaitingSince` vaut toujours `null` depuis X2 (2026-10-17) : il lisait
 * l'arrivée en attente de la boîte de réception, partie avec le push. Les
 * faits s'appliquent fiche par fiche, rien n'attend plus de relecture de
 * livraison. Le champ reste au contrat tant que la frise le lit.
 */
@Injectable()
export class InProcessDeliveryFactsReader extends B2bDeliveryFactsReader {
  constructor(private readonly items: CatalogItemRepository) {
    super();
  }

  async factsFor(skus: readonly string[]): Promise<ReadonlyMap<string, SkuDeliveryFacts>> {
    const wanted = new Set(skus);
    if (wanted.size === 0) {
      return new Map();
    }

    const mirror = await this.items.loadAll();
    const facts = new Map<string, SkuDeliveryFacts>();
    for (const item of mirror) {
      if (!wanted.has(item.sku)) {
        continue;
      }
      facts.set(item.sku, {
        sku: item.sku,
        accepted: true,
        factsReceivedAt: item.pimFacts.receivedAt,
        awaitingSince: null,
      });
    }
    return facts;
  }
}
