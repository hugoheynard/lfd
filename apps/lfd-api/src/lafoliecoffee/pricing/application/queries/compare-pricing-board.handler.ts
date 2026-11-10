import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PricingComparisonView } from "@lfd/contracts";

import { BoardComparisonService } from "../board-comparison.service.js";
import { ComparePricingBoardQuery } from "./compare-pricing-board.query.js";

@QueryHandler(ComparePricingBoardQuery)
export class ComparePricingBoardHandler implements IQueryHandler<
  ComparePricingBoardQuery,
  PricingComparisonView
> {
  constructor(private readonly comparison: BoardComparisonService) {}

  execute(query: ComparePricingBoardQuery): Promise<PricingComparisonView> {
    return this.comparison.compare(query.from, query.to);
  }
}
