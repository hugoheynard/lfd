import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { MarketSectorsView } from "@lfd/contracts";

import { MarketSectorsReader } from "../../domain/ports/market-sectors.reader.js";
import { GetMarketSectorsQuery } from "./get-market-sectors.query.js";

@QueryHandler(GetMarketSectorsQuery)
export class GetMarketSectorsHandler implements IQueryHandler<
  GetMarketSectorsQuery,
  MarketSectorsView
> {
  constructor(private readonly reader: MarketSectorsReader) {}

  execute(): Promise<MarketSectorsView> {
    return this.reader.load();
  }
}
