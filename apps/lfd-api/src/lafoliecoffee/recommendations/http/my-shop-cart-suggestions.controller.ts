import {
  cartSuggestionsPayloadSchema,
  type CartSuggestionsPayload,
  type CartSuggestionView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadCartSuggestionsQuery } from "../application/queries/read-cart-suggestions.query.js";

/**
 * **Les suggestions du panier d'une personne reconnue** — à part de la route
 * publique pour la raison de `MyShopCatalogueController` : une classe
 * `@Public()` ne porte pas une route murée. La société vient du contexte de
 * la requête, jamais de l'URL ; sans société (espace perso), le lecteur est
 * un particulier, comme la vitrine.
 */
@Controller("shop/suggestions/cart")
export class MyShopCartSuggestionsController {
  constructor(private readonly queries: QueryBus) {}

  @Post("mine")
  @HttpCode(HttpStatus.OK)
  read(
    @Body(new ZodBody(cartSuggestionsPayloadSchema)) payload: CartSuggestionsPayload,
    @ActingCompany() companyId: string | null,
  ): Promise<readonly CartSuggestionView[]> {
    return this.queries.execute<ReadCartSuggestionsQuery, readonly CartSuggestionView[]>(
      new ReadCartSuggestionsQuery(
        companyId,
        payload.skus,
        payload.target,
        payload.cartTotalCents ?? null,
      ),
    );
  }
}
