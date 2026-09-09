import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PricingBoardView } from "@lfd/contracts";

import { PricingBoardReader } from "../ports/pricing-board.reader.js";
import { ReadPricingBoardQuery } from "./read-pricing-board.query.js";

/**
 * `readForScreen` et non `read` : c'est la seule lecture qui montre le rapport
 * prix/volume, donc la seule qui doive payer les requêtes de ventes.
 */
@QueryHandler(ReadPricingBoardQuery)
export class ReadPricingBoardHandler implements IQueryHandler<
  ReadPricingBoardQuery,
  PricingBoardView
> {
  constructor(private readonly board: PricingBoardReader) {}

  execute(query: ReadPricingBoardQuery): Promise<PricingBoardView> {
    return this.board.readForScreen(query.at);
  }
}
