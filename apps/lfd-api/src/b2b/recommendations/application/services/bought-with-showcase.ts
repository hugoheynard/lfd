import { addDays, instantToLocal, type CartSuggestionView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import type { FulfillmentTarget } from "../../domain/orderable-today.js";
import { CoPurchaseReader } from "../../domain/ports/co-purchase.reader.js";
import { SuggestedArticleReader } from "../../domain/ports/suggested-article.reader.js";
import {
  BOUGHT_WITH_CANDIDATES,
  BOUGHT_WITH_MIN_CLIENTS,
  BOUGHT_WITH_WINDOW_DAYS,
  rankBoughtWith,
  type BoughtWithCandidate,
} from "../../domain/services/bought-with.js";
import { RecommendationFilter } from "./recommendation-filter.js";

/** Ce que le panier demande au calculé. */
export interface BoughtWithAsk {
  /** `null` = visiteur, espace perso ou aperçu : pas de tarif de société. */
  readonly companyId: string | null;
  /** La clientèle dont on lit les commandes, et la vitrine qu'on sert. */
  readonly audience: ShopAudience;
  /** Les articles du panier : ce qui déclenche, et ce qu'on ne propose pas. */
  readonly inCart: readonly string[];
  /** Ce que le staff montre déjà : le décidé passe avant, sans doublon. */
  readonly taken: readonly string[];
  readonly target: FulfillmentTarget | null;
  readonly places: number;
}

/**
 * **« Souvent pris avec »** (R2) : les paires du panier sur la fenêtre
 * glissante, sous le seuil d'anonymat, classées (`rankBoughtWith`), puis le
 * MÊME filtre que le décidé (`RecommendationFilter` : servi, commandable au
 * jour visé, absent du panier), puis la vitrine — au prix du rayon — et la
 * place bornée.
 *
 * À côté de `StaffSuggestionShowcase`, pas dedans : une source de plus est
 * une vitrine de plus que la query du panier compose, pas une branche dans la
 * chaîne des règles.
 *
 * Calculé à la lecture (décision R2 du plan) : une requête par panier,
 * mesurée sur la base jetable avant d'envisager une table de paires.
 */
@Injectable()
export class BoughtWithShowcase {
  constructor(
    private readonly pairs: CoPurchaseReader,
    private readonly filter: RecommendationFilter,
    private readonly articles: SuggestedArticleReader,
    private readonly clock: Clock,
  ) {}

  async show(ask: BoughtWithAsk): Promise<readonly CartSuggestionView[]> {
    if (ask.inCart.length === 0 || ask.places <= 0) {
      return [];
    }
    const today = instantToLocal(this.clock.now()).day;
    const pairs = await this.pairs.pairs({
      anchors: ask.inCart,
      audience: ask.audience,
      since: addDays(today, 1 - BOUGHT_WITH_WINDOW_DAYS),
      minClients: BOUGHT_WITH_MIN_CLIENTS,
      limit: BOUGHT_WITH_CANDIDATES,
    });
    const ranked = rankBoughtWith(pairs, { inCart: ask.inCart, taken: ask.taken });
    if (ranked.length === 0) {
      return [];
    }
    const kept = await this.filter.keep({
      candidates: ranked.map((candidate) => candidate.sku),
      audience: ask.audience,
      inCart: ask.inCart,
      target: ask.target,
    });
    const keptSkus = new Set(kept.map((item) => item.sku));
    return this.placed(
      ranked.filter((candidate) => keptSkus.has(candidate.sku)),
      ask,
    );
  }

  /**
   * Le rayon d'abord, la place ensuite — comme le décidé : un article que la
   * vitrine ne montre pas cède sa place. L'article du panier est lu au même
   * rayon, pour que la phrase cite le nom que le client voit ; s'il en est
   * absent, la proposition tombe plutôt que de citer un nom inventé.
   */
  private async placed(
    candidates: readonly BoughtWithCandidate[],
    ask: BoughtWithAsk,
  ): Promise<readonly CartSuggestionView[]> {
    if (candidates.length === 0) {
      return [];
    }
    const skus = [...new Set(candidates.flatMap(({ sku, withSku }) => [sku, withSku]))];
    const items = await this.articles.articles(skus, ask.companyId, ask.audience);
    const shown = candidates.flatMap(({ sku, withSku }): CartSuggestionView[] => {
      const item = items.get(sku);
      const anchor = items.get(withSku);
      if (item === undefined || anchor === undefined) {
        return [];
      }
      const reason = {
        source: "data",
        kind: "bought_with",
        withSku,
        withName: anchor.name,
      } as const;
      return [{ sku, item, reason }];
    });
    return shown.slice(0, ask.places);
  }
}
