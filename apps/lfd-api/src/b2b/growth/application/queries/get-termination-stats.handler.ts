import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { TerminationStatsView } from "@lfd/contracts";

import { TerminationStatsReader } from "../../domain/ports/termination-stats.reader.js";
import { GetTerminationStatsQuery } from "./get-termination-stats.query.js";

@QueryHandler(GetTerminationStatsQuery)
export class GetTerminationStatsHandler implements IQueryHandler<
  GetTerminationStatsQuery,
  TerminationStatsView
> {
  constructor(private readonly reader: TerminationStatsReader) {}

  execute(): Promise<TerminationStatsView> {
    return this.reader.load();
  }
}
