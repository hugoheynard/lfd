import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PriceLimitsView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { PriceLimitsReader } from "../ports/price-limits.reader.js";
import { ListPriceLimitsQuery } from "./list-price-limits.query.js";

@QueryHandler(ListPriceLimitsQuery)
export class ListPriceLimitsHandler implements IQueryHandler<
  ListPriceLimitsQuery,
  PriceLimitsView
> {
  constructor(
    private readonly limits: PriceLimitsReader,
    private readonly catalog: ProductCatalogReader,
    private readonly clock: Clock,
  ) {}

  /** Le catalogue d'aujourd'hui sert l'écart au tarif de référence des vues. */
  async execute(query: ListPriceLimitsQuery): Promise<PriceLimitsView> {
    const floors = await this.limits.inForce(
      query.clientele,
      this.clock.now(),
      await this.catalog.all(),
    );
    return { clientele: query.clientele, floors };
  }
}
