import type { PromotionsSourceView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PromotionsSourceReader } from "../../domain/ports/promotions-source.reader.js";
import { GetPromotionsSourceQuery } from "./get-promotions-source.query.js";

/** La source, et qui écrit : l'écran Promotions OU les anciens éditeurs, jamais les deux. */
@QueryHandler(GetPromotionsSourceQuery)
export class GetPromotionsSourceHandler implements IQueryHandler<
  GetPromotionsSourceQuery,
  PromotionsSourceView
> {
  constructor(private readonly source: PromotionsSourceReader) {}

  async execute(): Promise<PromotionsSourceView> {
    const source = await this.source.current();
    return { source, editable: source === "promotions" };
  }
}
