import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { CatalogItem } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import { judgeOrderable, type FulfillmentTarget } from "../../domain/orderable-today.js";
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
 * `listByShopSkus`, vérifié le 2026-10-18) — on ne relit donc pas
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
    return (await this.judge(input)).kept;
  }

  /**
   * Le même filtre, raisons comprises : ce qui est gardé, et pour chaque SKU
   * écarté la porte qui l'a arrêté. `keep` n'en lit que les gardés ; l'aperçu
   * du staff (RS5) lit le reste.
   */
  async judge(input: RecommendationFilterInput): Promise<FilterJudgement> {
    if (input.candidates.length === 0) {
      return { kept: [], refused: new Map() };
    }
    const [served, fallback] = await Promise.all([
      this.catalog.resolveMany(input.candidates, input.audience),
      input.target === null ? Promise.resolve([]) : this.cutoffs.list(),
    ]);
    const refused = new Map<string, FilterRefusal>();
    const resolved = input.candidates.flatMap((sku) => {
      const item = served.get(sku);
      if (item === undefined) {
        refused.set(sku, "item_not_served");
        return [];
      }
      return [item];
    });
    const kept: CatalogItem[] = [];
    const verdicts = judgeOrderable({
      candidates: resolved,
      inCart: new Set(input.inCart),
      target: input.target,
      fallback,
      now: this.clock.now(),
    });
    for (const { candidate, refusal } of verdicts) {
      if (refusal === null) {
        kept.push(candidate);
      } else if (refusal !== "duplicate") {
        refused.set(candidate.sku, refusal);
      }
    }
    return { kept, refused };
  }

  /**
   * **Le même filtre, sur plusieurs jours** — pour l'alerte (RS10) : ce qui
   * n'est pas servi à ce lecteur, et ce qui, servi, n'est commandable AUCUN
   * des jours donnés (`judgeOrderable`, la porte de la boutique, jour par
   * jour). Sans panier, et sans point de retrait : la règle générale du
   * commerce, celle de la livraison. Une liste de jours vide ne juge que le
   * service.
   */
  async judgeOver(input: PeriodFilterInput): Promise<PeriodJudgement> {
    if (input.candidates.length === 0) {
      return { notServed: new Set(), neverOrderable: new Set() };
    }
    const [served, fallback] = await Promise.all([
      this.catalog.resolveMany(input.candidates, input.audience),
      input.days.length === 0 ? Promise.resolve([]) : this.cutoffs.list(),
    ]);
    const notServed = new Set(input.candidates.filter((sku) => !served.has(sku)));
    const items = [...served.values()];
    const now = this.clock.now();
    const openSomeDay = new Set<string>();
    for (const date of input.days) {
      const verdicts = judgeOrderable({
        candidates: items.filter((item) => !openSomeDay.has(item.sku)),
        inCart: new Set(),
        target: { date, pickupAddressId: null },
        fallback,
        now,
      });
      verdicts
        .filter(({ refusal }) => refusal === null)
        .forEach(({ candidate }) => openSomeDay.add(candidate.sku));
    }
    const neverOrderable = new Set(
      input.days.length === 0
        ? []
        : items.map((item) => item.sku).filter((sku) => !openSomeDay.has(sku)),
    );
    return { notServed, neverOrderable };
  }
}

/** Ce qu'on demande au filtre sur une période : des candidats, un lecteur, des jours. */
export interface PeriodFilterInput {
  readonly candidates: readonly string[];
  readonly audience: ShopAudience;
  /** Les jours `AAAA-MM-JJ` où chercher un jour commandable. */
  readonly days: readonly string[];
}

/** Ce que le filtre dit d'une période. */
export interface PeriodJudgement {
  readonly notServed: ReadonlySet<string>;
  readonly neverOrderable: ReadonlySet<string>;
}

/** Pourquoi le filtre écarte un SKU. */
export type FilterRefusal = "item_not_served" | "item_in_cart" | "item_not_orderable_that_day";

/** Ce que le filtre garde, et ce qu'il écarte avec sa raison. */
export interface FilterJudgement {
  readonly kept: readonly CatalogItem[];
  readonly refused: ReadonlyMap<string, FilterRefusal>;
}
