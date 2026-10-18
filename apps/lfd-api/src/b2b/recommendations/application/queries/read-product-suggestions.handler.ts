import type { ProductSuggestionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  productCandidates,
  STAFF_PRODUCT_PLACES,
} from "../../domain/services/product-suggestions.js";
import { StaffSuggestionShowcase } from "../services/staff-suggestion-showcase.js";
import { ReadProductSuggestionsQuery } from "./read-product-suggestions.query.js";

/**
 * Les suggestions du staff sur la fiche : la vitrine commune
 * (`StaffSuggestionShowcase`) avec les déclencheurs de la fiche — « partout »,
 * et « fiche ouverte » sur la sienne. L'article de la fiche n'est jamais
 * proposé.
 */
@QueryHandler(ReadProductSuggestionsQuery)
export class ReadProductSuggestionsHandler implements IQueryHandler<
  ReadProductSuggestionsQuery,
  readonly ProductSuggestionView[]
> {
  constructor(private readonly showcase: StaffSuggestionShowcase) {}

  execute(query: ReadProductSuggestionsQuery): Promise<readonly ProductSuggestionView[]> {
    return this.showcase.show({
      placement: "product",
      companyId: query.companyId,
      inCart: query.skus,
      target: query.target,
      places: STAFF_PRODUCT_PLACES,
      candidatesOf: (ordered) => Promise.resolve(productCandidates(ordered, query.viewedSku)),
    });
  }
}
