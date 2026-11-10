import type { PromotionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionNotFoundError } from "../../domain/errors/promotion-errors.js";
import { PromotionBrowser } from "../../domain/ports/promotion-browser.reader.js";
import { PromotionCatalogueReader } from "../../domain/ports/promotion-catalogue.reader.js";
import { GetPromotionQuery } from "./get-promotion.query.js";
import { promotionViewOf } from "./promotion-view.js";

@QueryHandler(GetPromotionQuery)
export class GetPromotionHandler implements IQueryHandler<GetPromotionQuery, PromotionView> {
  constructor(
    private readonly promotions: PromotionBrowser,
    private readonly catalogue: PromotionCatalogueReader,
    private readonly clock: Clock,
  ) {}

  /** @throws {PromotionNotFoundError} elle n'existe pas. */
  async execute(query: GetPromotionQuery): Promise<PromotionView> {
    const promotion = await this.promotions.find(query.id);
    if (promotion === null) {
      throw new PromotionNotFoundError(query.id);
    }
    return promotionViewOf(promotion, this.clock.now(), await this.catalogue.snapshot());
  }
}
