import type { PromotionListView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionBrowser } from "../../domain/ports/promotion-browser.reader.js";
import { PromotionCatalogueReader } from "../../domain/ports/promotion-catalogue.reader.js";
import { PromotionsSourceReader } from "../../domain/ports/promotions-source.reader.js";
import { listedPointsOf } from "../../domain/promotion-fulfillment.js";
import { ListPromotionsQuery } from "./list-promotions.query.js";
import { promotionViewOf } from "./promotion-view.js";

/**
 * La liste, et la source : l'écran est en lecture tant que la bascule n'est
 * pas faite (`promotions.md`, § 2.3, L7), et c'est le serveur qui le lui dit.
 */
@QueryHandler(ListPromotionsQuery)
export class ListPromotionsHandler implements IQueryHandler<
  ListPromotionsQuery,
  PromotionListView
> {
  constructor(
    private readonly promotions: PromotionBrowser,
    private readonly catalogue: PromotionCatalogueReader,
    private readonly source: PromotionsSourceReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListPromotionsQuery): Promise<PromotionListView> {
    const now = this.clock.now();
    const [all, catalogue, source] = await Promise.all([
      query.companyId === null ? this.promotions.all() : this.promotions.naming(query.companyId),
      this.catalogue.snapshot(),
      this.source.current(),
    ]);
    const { pickupId } = query;
    // Celles qui NOMMENT ce point — le filtre par point de l'écran Promotions.
    const shown =
      pickupId === null
        ? all
        : all.filter((promotion) => listedPointsOf(promotion.terms.fulfillment).includes(pickupId));
    return {
      source,
      editable: source === "promotions",
      promotions: shown.map((promotion) => promotionViewOf(promotion, now, catalogue)),
    };
  }
}
