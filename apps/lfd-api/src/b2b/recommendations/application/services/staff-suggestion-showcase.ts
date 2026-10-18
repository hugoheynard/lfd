import {
  instantToLocal,
  type CartSuggestionView,
  type StaffSuggestionPlacement,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import type { StaffSuggestionRuleSnapshot } from "../../domain/entities/staff-suggestion-rule.js";
import type { FulfillmentTarget } from "../../domain/orderable-today.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { SuggestedArticleReader } from "../../domain/ports/suggested-article.reader.js";
import { SuggestionOrderReader } from "../../domain/ports/suggestion-order.reader.js";
import { applicableSuggestions } from "../../domain/services/applicable-suggestions.js";
import type { SuggestionCandidate } from "../../domain/services/suggestion-candidates.js";
import { RecommendationFilter } from "./recommendation-filter.js";

/** Ce qu'un emplacement demande : son lecteur, son panier, son jour, sa place. */
export interface ShowcaseAsk {
  readonly placement: StaffSuggestionPlacement;
  /** `null` = visiteur ou espace perso : lecteur particulier, tarif public. */
  readonly companyId: string | null;
  /** Les SKU au panier : jamais suggérés. */
  readonly inCart: readonly string[];
  readonly target: FulfillmentTarget | null;
  /** Combien d'articles décidés l'emplacement montre (Q1). */
  readonly places: number;
  /** Ce que l'emplacement déclenche, parmi les règles applicables déjà classées. */
  readonly candidatesOf: (
    ordered: readonly StaffSuggestionRuleSnapshot[],
    audience: ShopAudience,
  ) => Promise<readonly SuggestionCandidate[]>;
}

/**
 * **La vitrine des suggestions du staff**, commune au panier et à la fiche
 * (RS2) : les règles applicables à l'emplacement (période au jour métier,
 * audience, interrupteur, ordre réglé), puis celles que l'emplacement
 * déclenche, puis le filtre commun (servi, commandable au jour visé, absent
 * du panier), et la place bornée. L'article sort à son prix de vitrine.
 *
 * Un emplacement de plus est une query de plus qui l'appelle avec son
 * déclencheur, pas une branche ici. La vue rendue est celle du panier
 * (`CartSuggestionView`) : la fiche en sert la même (`ProductSuggestionView`).
 *
 * Le lecteur se déduit de la société agissante comme partout dans le commerce
 * (`ShopCataloguePricing`) : sans société, particulier.
 */
@Injectable()
export class StaffSuggestionShowcase {
  constructor(
    private readonly rules: StaffSuggestionRuleReader,
    private readonly order: SuggestionOrderReader,
    private readonly filter: RecommendationFilter,
    private readonly articles: SuggestedArticleReader,
    private readonly clock: Clock,
  ) {}

  async show(ask: ShowcaseAsk): Promise<readonly CartSuggestionView[]> {
    const audience = ask.companyId === null ? "public" : "pro";
    const [live, order] = await Promise.all([this.rules.listLive(), this.order.current()]);
    const ordered = applicableSuggestions(live, {
      placement: ask.placement,
      today: instantToLocal(this.clock.now()).day,
      reader: audience,
      order: order.order,
    });
    if (ordered.length === 0) {
      return [];
    }
    const candidates = await ask.candidatesOf(ordered, audience);
    const kept = await this.filter.keep({
      candidates: candidates.map((candidate) => candidate.sku),
      audience,
      inCart: ask.inCart,
      target: ask.target,
    });
    const placed = await this.placed(
      candidates,
      kept.map((item) => item.sku),
      ask.companyId,
    );
    return placed.slice(0, ask.places);
  }

  /**
   * Le rayon d'abord, la place ensuite : un article que la vitrine ne montre
   * pas (réservé à une opération, p. ex.) cède sa place au suivant.
   */
  private async placed(
    candidates: readonly SuggestionCandidate[],
    kept: readonly string[],
    companyId: string | null,
  ): Promise<readonly CartSuggestionView[]> {
    if (kept.length === 0) {
      return [];
    }
    const items = await this.articles.articles(kept, companyId);
    const ruleOf = new Map(candidates.map((candidate) => [candidate.sku, candidate.rule]));
    return kept.flatMap((sku): CartSuggestionView[] => {
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
    });
  }
}
