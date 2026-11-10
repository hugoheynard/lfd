import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PriceRuleView } from "@lfd/contracts";

import { PricingBoardReader } from "../ports/pricing-board.reader.js";
import { ListArchivedPriceRulesQuery } from "./list-archived-price-rules.query.js";

@QueryHandler(ListArchivedPriceRulesQuery)
export class ListArchivedPriceRulesHandler implements IQueryHandler<
  ListArchivedPriceRulesQuery,
  PriceRuleView[]
> {
  constructor(private readonly board: PricingBoardReader) {}

  execute(): Promise<PriceRuleView[]> {
    return this.board.archivedRules();
  }
}
