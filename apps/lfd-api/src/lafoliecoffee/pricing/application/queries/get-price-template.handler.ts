import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PriceTemplateView } from "@lfd/contracts";

import { PriceTemplatesQuery } from "./price-templates.query.js";
import { GetPriceTemplateQuery } from "./get-price-template.query.js";

/**
 * Rend `null` et ne lève pas : le refus est **traduit** au contrôleur, dont le
 * `NotFoundException` sert déjà un front en service. Le déplacer ici changerait
 * la forme du corps d'erreur pour zéro gain.
 */
@QueryHandler(GetPriceTemplateQuery)
export class GetPriceTemplateHandler implements IQueryHandler<
  GetPriceTemplateQuery,
  PriceTemplateView | null
> {
  constructor(private readonly templates: PriceTemplatesQuery) {}

  execute(query: GetPriceTemplateQuery): Promise<PriceTemplateView | null> {
    return this.templates.byId(query.id);
  }
}
