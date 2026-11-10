import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PriceTemplateView } from "@lfd/contracts";

import { PriceTemplatesQuery } from "./price-templates.query.js";
import { ListPriceTemplatesQuery } from "./list-price-templates.query.js";

/**
 * ⚠️ `PriceTemplatesQuery` est le **service** de lecture des gabarits, pas une
 * question du bus : il garde son nom.
 */
@QueryHandler(ListPriceTemplatesQuery)
export class ListPriceTemplatesHandler implements IQueryHandler<
  ListPriceTemplatesQuery,
  readonly PriceTemplateView[]
> {
  constructor(private readonly templates: PriceTemplatesQuery) {}

  execute(query: ListPriceTemplatesQuery): Promise<readonly PriceTemplateView[]> {
    return this.templates.list(query.kind);
  }
}
