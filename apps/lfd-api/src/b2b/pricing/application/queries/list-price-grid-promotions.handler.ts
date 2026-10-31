import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PriceGridPromotionView, PriceGridPromotionsView } from "@lfd/contracts";

import type { AdmittedPromotion } from "../../../promotions/domain/live-promotion.js";
import { effectValueOf } from "../../../promotions/domain/promotion-effect.js";
import { PriceGridContexts } from "../price-grid-context.js";
import { PriceGridPromotions } from "../price-grid-promotions.js";
import { ListPriceGridPromotionsQuery } from "./list-price-grid-promotions.query.js";

/** Une promotion, telle que le panneau la liste : le libellé que CE public lit. */
export function priceGridPromotionView(promotion: AdmittedPromotion): PriceGridPromotionView {
  return {
    id: promotion.id,
    label: promotion.servedLabel.fr,
    effect: { kind: promotion.effect.kind, value: effectValueOf(promotion.effect) },
    cumulative: promotion.cumulative,
  };
}

@QueryHandler(ListPriceGridPromotionsQuery)
export class ListPriceGridPromotionsHandler implements IQueryHandler<
  ListPriceGridPromotionsQuery,
  PriceGridPromotionsView
> {
  constructor(
    private readonly contexts: PriceGridContexts,
    private readonly promotions: PriceGridPromotions,
  ) {}

  async execute(query: ListPriceGridPromotionsQuery): Promise<PriceGridPromotionsView> {
    const context = await this.contexts.contextOf(query.question);
    const set = await this.promotions.of(context);
    return {
      basis: context.serving.basis,
      displayedPrice: set.displayedPrice.map(priceGridPromotionView),
      basket: set.basket.map(priceGridPromotionView),
    };
  }
}
