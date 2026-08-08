import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { MarketVolumeView } from "@lfd/contracts";

import { MarketVolumeReader } from "../../domain/ports/market-volume.reader.js";
import { GetMarketVolumeQuery } from "./get-market-volume.query.js";

@QueryHandler(GetMarketVolumeQuery)
export class GetMarketVolumeHandler implements IQueryHandler<
  GetMarketVolumeQuery,
  MarketVolumeView
> {
  constructor(private readonly reader: MarketVolumeReader) {}

  execute(): Promise<MarketVolumeView> {
    return this.reader.load();
  }
}
