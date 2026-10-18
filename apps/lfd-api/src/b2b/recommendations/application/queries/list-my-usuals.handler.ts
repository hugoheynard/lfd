import { instantToLocal, type UsualSuggestionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PurchaseHistoryReader } from "../../domain/ports/purchase-history.reader.js";
import { SuggestedArticleReader } from "../../domain/ports/suggested-article.reader.js";
import {
  rankUsuals,
  USUALS_PLACES,
  usualsWindowStart,
  type UsualCandidate,
} from "../../domain/services/usuals.js";
import { RecommendationFilter } from "../services/recommendation-filter.js";
import { ListMyUsualsQuery } from "./list-my-usuals.query.js";

/** Les habituels ne se lisent que dans la vitrine des pros. */
const USUALS_AUDIENCE = "pro";

/**
 * « Vos habituels » : l'historique de la SOCIÉTÉ sous son mur
 * (`PurchaseHistoryReader`), classé (`rankUsuals` : trois commandes au moins,
 * rythme hebdomadaire ou fréquence), puis le MÊME filtre que toute
 * suggestion (`RecommendationFilter` : servi au pro, commandable au jour
 * visé, absent du panier), puis la vitrine au prix de la société, puis la
 * place. Sans société, rien : un particulier n'a pas d'habituels avant l'avis
 * du cabinet (lot R3).
 */
@QueryHandler(ListMyUsualsQuery)
export class ListMyUsualsHandler implements IQueryHandler<
  ListMyUsualsQuery,
  readonly UsualSuggestionView[]
> {
  constructor(
    private readonly history: PurchaseHistoryReader,
    private readonly filter: RecommendationFilter,
    private readonly articles: SuggestedArticleReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListMyUsualsQuery): Promise<readonly UsualSuggestionView[]> {
    const { companyId } = query;
    if (companyId === null) {
      return [];
    }
    const today = instantToLocal(this.clock.now()).day;
    const history = await this.history.ofCompany({ companyId, since: usualsWindowStart(today) });
    const ranked = rankUsuals(history, query.skus);
    if (ranked.length === 0) {
      return [];
    }
    const kept = await this.filter.keep({
      candidates: ranked.map((candidate) => candidate.sku),
      audience: USUALS_AUDIENCE,
      inCart: query.skus,
      target: query.target,
    });
    const keptSkus = new Set(kept.map((item) => item.sku));
    return this.placed(
      ranked.filter((candidate) => keptSkus.has(candidate.sku)),
      companyId,
    );
  }

  /** Le rayon d'abord, la place ensuite : un article que la vitrine ne montre pas cède sa place. */
  private async placed(
    candidates: readonly UsualCandidate[],
    companyId: string,
  ): Promise<readonly UsualSuggestionView[]> {
    if (candidates.length === 0) {
      return [];
    }
    const items = await this.articles.articles(
      candidates.map((candidate) => candidate.sku),
      companyId,
      USUALS_AUDIENCE,
    );
    return candidates
      .flatMap(({ sku, reason }): UsualSuggestionView[] => {
        const item = items.get(sku);
        return item === undefined ? [] : [{ sku, item, reason }];
      })
      .slice(0, USUALS_PLACES);
  }
}
