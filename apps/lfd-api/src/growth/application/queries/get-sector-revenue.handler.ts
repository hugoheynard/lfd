import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { SectorRevenueView } from "@lfd/contracts";

import { SectorRevenueReader } from "../../domain/ports/sector-revenue.reader.js";
import { GetSectorRevenueQuery } from "./get-sector-revenue.query.js";

@QueryHandler(GetSectorRevenueQuery)
export class GetSectorRevenueHandler implements IQueryHandler<
  GetSectorRevenueQuery,
  SectorRevenueView
> {
  constructor(private readonly reader: SectorRevenueReader) {}

  execute(): Promise<SectorRevenueView> {
    return this.reader.load();
  }
}
