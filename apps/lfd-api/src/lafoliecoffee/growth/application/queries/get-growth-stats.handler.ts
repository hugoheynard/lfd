import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { GrowthStatsView } from "@lfd/contracts";
import { GrowthStatsReader } from "../../domain/ports/growth-stats.reader.js";
import { GetGrowthStatsQuery } from "./get-growth-stats.query.js";

/** Délègue au reader — aucune logique propre. */
@QueryHandler(GetGrowthStatsQuery)
export class GetGrowthStatsHandler implements IQueryHandler<GetGrowthStatsQuery, GrowthStatsView> {
  constructor(private readonly stats: GrowthStatsReader) {}

  execute(): Promise<GrowthStatsView> {
    return this.stats.load();
  }
}
