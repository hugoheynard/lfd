import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { MarketAdoptionView } from "@lfd/contracts";

import { MarketAdoptionReader } from "../../domain/ports/market-adoption.reader.js";
import { GetMarketAdoptionQuery } from "./get-market-adoption.query.js";

@QueryHandler(GetMarketAdoptionQuery)
export class GetMarketAdoptionHandler implements IQueryHandler<
  GetMarketAdoptionQuery,
  MarketAdoptionView
> {
  constructor(private readonly reader: MarketAdoptionReader) {}

  execute(): Promise<MarketAdoptionView> {
    return this.reader.load();
  }
}
