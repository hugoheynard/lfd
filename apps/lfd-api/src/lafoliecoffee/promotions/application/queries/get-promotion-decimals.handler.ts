import type { PromotionDecimalsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { promotionDecimalNets } from "../../../pricing/domain/promotion-decimals.js";
import { livePromotionOf } from "../../domain/live-promotion.js";
import { PromotionProPricesReader } from "../../domain/ports/promotion-pro-prices.reader.js";
import { Promotion } from "../../domain/promotion.js";
import { GetPromotionDecimalsQuery } from "./get-promotion-decimals.query.js";

/** Combien d'exemples l'avertissement montre. */
const EXAMPLES = 3;
/** L'identité d'un aperçu : il n'est jamais écrit, et ne rivalise avec rien. */
const PREVIEW = "apercu";

/**
 * Un avertissement, jamais un refus : la promotion reste ce qu'elle est.
 * Le catalogue n'est lu que pour une remise qui peut en créer.
 *
 * Les termes passent par `Promotion.pose` sans être écrits : des termes que
 * l'agrégat refuserait (saisie incomplète) sont refusés ici aussi, et
 * l'écran se tait plutôt que d'avertir sur une promotion impossible.
 */
@QueryHandler(GetPromotionDecimalsQuery)
export class GetPromotionDecimalsHandler implements IQueryHandler<
  GetPromotionDecimalsQuery,
  PromotionDecimalsView
> {
  constructor(
    private readonly prices: PromotionProPricesReader,
    private readonly clock: Clock,
  ) {}

  /** @throws les refus de `assertTerms`, pour des termes que l'agrégat refuserait. */
  async execute(query: GetPromotionDecimalsQuery): Promise<PromotionDecimalsView> {
    const now = this.clock.now();
    const live = livePromotionOf(Promotion.pose(PREVIEW, query.terms, PREVIEW, now));
    if (live.effect.kind !== "percent_off") {
      return { count: 0, examples: [] };
    }
    const nets = promotionDecimalNets(live, await this.prices.proArticles(), now);
    const examples = [...nets]
      .sort((left, right) => left.article.name.localeCompare(right.article.name, "fr"))
      .slice(0, EXAMPLES)
      .map(({ article, netMillicents }) => ({
        sku: article.sku,
        name: article.name,
        priceMillicents: article.priceMillicents,
        netMillicents,
      }));
    return { count: nets.length, examples };
  }
}
