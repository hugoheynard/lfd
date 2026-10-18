import type { CartSuggestionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CartFamilyReader } from "../../domain/ports/cart-family.reader.js";
import { BOUGHT_WITH_CART_PLACES } from "../../domain/services/bought-with.js";
import { cartTriggering, STAFF_CART_PLACES } from "../../domain/services/cart-suggestions.js";
import { BoughtWithShowcase } from "../services/bought-with-showcase.js";
import { StaffSuggestionShowcase } from "../services/staff-suggestion-showcase.js";
import { ReadCartSuggestionsQuery } from "./read-cart-suggestions.query.js";

/**
 * Les suggestions du panier : d'abord le DÉCIDÉ — la vitrine commune
 * (`StaffSuggestionShowcase`) avec les déclencheurs du panier, « partout »,
 * un article au panier, une famille au panier (la lignée lue au catalogue
 * servi, seulement s'il reste une règle applicable) —, puis le CALCULÉ
 * (`BoughtWithShowcase`, R2), à sa propre place, sans reprendre ce que le
 * staff montre déjà.
 *
 * Les deux à la suite, pas en parallèle : le calculé doit savoir ce que le
 * décidé a pris.
 */
@QueryHandler(ReadCartSuggestionsQuery)
export class ReadCartSuggestionsHandler implements IQueryHandler<
  ReadCartSuggestionsQuery,
  readonly CartSuggestionView[]
> {
  constructor(
    private readonly showcase: StaffSuggestionShowcase,
    private readonly boughtWith: BoughtWithShowcase,
    private readonly families: CartFamilyReader,
  ) {}

  async execute(query: ReadCartSuggestionsQuery): Promise<readonly CartSuggestionView[]> {
    const staff = await this.showcase.show({
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
    const computed = await this.boughtWith.show({
      companyId: query.companyId,
      audience: query.companyId === null ? "public" : "pro",
      inCart: query.skus,
      taken: staff.map((view) => view.sku),
      target: query.target,
      places: BOUGHT_WITH_CART_PLACES,
    });
    return [...staff, ...computed];
  }
}
