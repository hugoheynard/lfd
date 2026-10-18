import type { CartSuggestionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CartFamilyReader } from "../../domain/ports/cart-family.reader.js";
import { cartTriggering, STAFF_CART_PLACES } from "../../domain/services/cart-suggestions.js";
import { StaffSuggestionShowcase } from "../services/staff-suggestion-showcase.js";
import { ReadCartSuggestionsQuery } from "./read-cart-suggestions.query.js";

/**
 * Les suggestions du staff au panier : la vitrine commune
 * (`StaffSuggestionShowcase`) avec les déclencheurs du panier — « partout »,
 * un article au panier, une famille au panier (la lignée lue au catalogue
 * servi, seulement s'il reste une règle applicable).
 */
@QueryHandler(ReadCartSuggestionsQuery)
export class ReadCartSuggestionsHandler implements IQueryHandler<
  ReadCartSuggestionsQuery,
  readonly CartSuggestionView[]
> {
  constructor(
    private readonly showcase: StaffSuggestionShowcase,
    private readonly families: CartFamilyReader,
  ) {}

  execute(query: ReadCartSuggestionsQuery): Promise<readonly CartSuggestionView[]> {
    return this.showcase.show({
      placement: "cart",
      companyId: query.companyId,
      inCart: query.skus,
      target: query.target,
      cartTotalCents: query.cartTotalCents,
      places: STAFF_CART_PLACES,
      triggeringOf: async (audience) => {
        const familyPaths = await this.families.pathsOf(query.skus, audience);
        return cartTriggering({ skus: query.skus, familyPaths });
      },
    });
  }
}
