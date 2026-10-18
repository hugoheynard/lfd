import { instantToLocal, type CartSuggestionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CartFamilyReader } from "../../domain/ports/cart-family.reader.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { SuggestedArticleReader } from "../../domain/ports/suggested-article.reader.js";
import { SuggestionOrderReader } from "../../domain/ports/suggestion-order.reader.js";
import { applicableSuggestions } from "../../domain/services/applicable-suggestions.js";
import {
  cartCandidates,
  STAFF_CART_PLACES,
  type CartCandidate,
} from "../../domain/services/cart-suggestions.js";
import { RecommendationFilter } from "../services/recommendation-filter.js";
import { ReadCartSuggestionsQuery } from "./read-cart-suggestions.query.js";

/**
 * Les règles applicables au panier (période au jour métier, audience,
 * interrupteur, ordre réglé), puis celles dont le déclencheur est vrai pour
 * CE panier, puis le filtre commun (servi, commandable au jour visé, absent du
 * panier), et la place bornée. L'article sort à son prix de vitrine.
 *
 * Le lecteur se déduit de la société agissante comme partout dans le commerce
 * (`ShopCataloguePricing`) : sans société, particulier.
 */
@QueryHandler(ReadCartSuggestionsQuery)
export class ReadCartSuggestionsHandler implements IQueryHandler<
  ReadCartSuggestionsQuery,
  readonly CartSuggestionView[]
> {
  constructor(
    private readonly rules: StaffSuggestionRuleReader,
    private readonly order: SuggestionOrderReader,
    private readonly families: CartFamilyReader,
    private readonly filter: RecommendationFilter,
    private readonly articles: SuggestedArticleReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ReadCartSuggestionsQuery): Promise<readonly CartSuggestionView[]> {
    const audience = query.companyId === null ? "public" : "pro";
    const [live, order] = await Promise.all([this.rules.listLive(), this.order.current()]);
    const ordered = applicableSuggestions(live, {
      placement: "cart",
      today: instantToLocal(this.clock.now()).day,
      reader: audience,
      order: order.order,
    });
    if (ordered.length === 0) {
      return [];
    }
    const familyPaths = await this.families.pathsOf(query.skus, audience);
    const candidates = cartCandidates(ordered, { skus: query.skus, familyPaths });
    const kept = await this.filter.keep({
      candidates: candidates.map((candidate) => candidate.sku),
      audience,
      inCart: query.skus,
      target: query.target,
    });
    return this.placed(
      candidates,
      kept.map((item) => item.sku),
      query.companyId,
    );
  }

  /**
   * Le rayon d'abord, la place ensuite : un article que la vitrine ne montre
   * pas (réservé à une opération, p. ex.) cède sa place au suivant.
   */
  private async placed(
    candidates: readonly CartCandidate[],
    kept: readonly string[],
    companyId: string | null,
  ): Promise<readonly CartSuggestionView[]> {
    if (kept.length === 0) {
      return [];
    }
    const items = await this.articles.articles(kept, companyId);
    const ruleOf = new Map(candidates.map((candidate) => [candidate.sku, candidate.rule]));
    return kept
      .flatMap((sku): CartSuggestionView[] => {
        const item = items.get(sku);
        const rule = ruleOf.get(sku);
        if (item === undefined || rule === undefined) {
          return [];
        }
        const reason = {
          source: "staff",
          ruleId: rule.id.toLowerCase(),
          phrase: rule.phrase,
        } as const;
        return [{ sku, item, reason }];
      })
      .slice(0, STAFF_CART_PLACES);
  }
}
