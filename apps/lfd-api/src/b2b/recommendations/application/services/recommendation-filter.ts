import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { CatalogItem } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import { keepOrderable, type FulfillmentTarget } from "../../domain/orderable-today.js";
import { RecommendationCutoffReader } from "../../domain/ports/recommendation-cutoff.reader.js";

/** Ce qu'on demande au filtre : des candidats déjà classés, pour un lecteur. */
export interface RecommendationFilterInput {
  /** Les SKU proposés, dans l'ordre où ils seraient montrés. */
  readonly candidates: readonly string[];
  readonly audience: ShopAudience;
  /** Les SKU déjà au panier : jamais suggérés. */
  readonly inCart: readonly string[];
  /** Le jour visé, s'il est choisi ; `null` = pas d'heure à opposer. */
  readonly target: FulfillmentTarget | null;
}

/**
 * **Le filtre de toute suggestion** (R4) — le dernier pas, sans repli.
 *
 * Trois portes dans l'ordre du plan : `resolveMany(skus, audience)`, qui
 * applique `servedTo` lui-même (`prisma-catalog.reader.ts`,
 * `listDefaultsByProductSkus`, vérifié le 2026-10-18) — on ne relit donc pas
 * le masquage ici ; puis l'heure limite du jour visé ; enfin le panier. Un
 * article qui ne passe pas disparaît, et une liste vide rend une liste vide.
 *
 * Partagé par toutes les queries de recommandation à venir (R1, R2…) : un
 * filtre recopié par écran finirait par suggérer ici ce qu'un autre cache.
 */
@Injectable()
export class RecommendationFilter {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly cutoffs: RecommendationCutoffReader,
    private readonly clock: Clock,
  ) {}

  async keep(input: RecommendationFilterInput): Promise<readonly CatalogItem[]> {
    if (input.candidates.length === 0) {
      return [];
    }
    const [served, fallback] = await Promise.all([
      this.catalog.resolveMany(input.candidates, input.audience),
      input.target === null ? Promise.resolve([]) : this.cutoffs.list(),
    ]);
    const resolved = input.candidates.flatMap((sku) => {
      const item = served.get(sku);
      return item === undefined ? [] : [item];
    });
    return keepOrderable({
      candidates: resolved,
      inCart: new Set(input.inCart),
      target: input.target,
      fallback,
      now: this.clock.now(),
    });
  }
}
