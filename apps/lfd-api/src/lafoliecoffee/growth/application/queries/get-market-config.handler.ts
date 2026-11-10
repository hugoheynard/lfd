import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { MarketConfigView } from "@lfd/contracts";

import { MarketConfigStore } from "../../domain/ports/market-config.store.js";
import { GetMarketConfigQuery } from "./get-market-config.query.js";

@QueryHandler(GetMarketConfigQuery)
export class GetMarketConfigHandler implements IQueryHandler<
  GetMarketConfigQuery,
  MarketConfigView
> {
  constructor(private readonly store: MarketConfigStore) {}

  execute(): Promise<MarketConfigView> {
    return this.store.load();
  }
}
