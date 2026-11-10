import type { ProductAudienceCounterView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { InvalidAudiencePeriodError } from "../../domain/errors/recommendation-errors.js";
import { AudienceCounterReader } from "../../domain/ports/audience-counter.reader.js";
import { ListProductAudienceCountersQuery } from "./list-product-audience-counters.query.js";

/** Relit les compteurs par SKU et par jour — la matière des écrans de mesure à venir. */
@QueryHandler(ListProductAudienceCountersQuery)
export class ListProductAudienceCountersHandler implements IQueryHandler<
  ListProductAudienceCountersQuery,
  readonly ProductAudienceCounterView[]
> {
  constructor(private readonly counters: AudienceCounterReader) {}

  async execute(
    query: ListProductAudienceCountersQuery,
  ): Promise<readonly ProductAudienceCounterView[]> {
    // Deux jours `YYYY-MM-DD` se comparent dans l'ordre lexical.
    if (query.from > query.to) {
      throw new InvalidAudiencePeriodError(query.from, query.to);
    }
    return this.counters.between(query.from, query.to);
  }
}
