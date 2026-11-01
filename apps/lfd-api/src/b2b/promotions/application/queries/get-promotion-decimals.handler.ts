import type { PromotionDecimalsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { promotionDecimalNets } from "../../../pricing/domain/promotion-decimals.js";
import { PromotionNotFoundError } from "../../domain/errors/promotion-errors.js";
import { livePromotionOf } from "../../domain/live-promotion.js";
import { PromotionBrowser } from "../../domain/ports/promotion-browser.reader.js";
import { PromotionProPricesReader } from "../../domain/ports/promotion-pro-prices.reader.js";
import { GetPromotionDecimalsQuery } from "./get-promotion-decimals.query.js";

/** Combien d'exemples l'avertissement montre. */
const EXAMPLES = 3;

/**
 * Un avertissement, jamais un refus : la promotion reste ce qu'elle est.
 * Le catalogue n'est lu que pour une remise qui peut en créer.
 */
@QueryHandler(GetPromotionDecimalsQuery)
export class GetPromotionDecimalsHandler implements IQueryHandler<
  GetPromotionDecimalsQuery,
  PromotionDecimalsView
> {
  constructor(
    private readonly promotions: PromotionBrowser,
    private readonly prices: PromotionProPricesReader,
    private readonly clock: Clock,
  ) {}

  /** @throws {PromotionNotFoundError} elle n'existe pas. */
  async execute(query: GetPromotionDecimalsQuery): Promise<PromotionDecimalsView> {
    const promotion = await this.promotions.find(query.id);
    if (promotion === null) {
      throw new PromotionNotFoundError(query.id);
    }
    const live = livePromotionOf(promotion);
    if (live.effect.kind !== "percent_off") {
      return { count: 0, examples: [] };
    }
    const nets = promotionDecimalNets(live, await this.prices.proArticles(), this.clock.now());
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
