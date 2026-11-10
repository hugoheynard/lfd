import {
  cartSuggestionsPayloadSchema,
  type CartSuggestionsPayload,
  type CartSuggestionView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadCartSuggestionsQuery } from "../application/queries/read-cart-suggestions.query.js";

/**
 * **Les suggestions du panier**, sans jeton — le lecteur est un particulier.
 *
 * Publique comme la vitrine et le devis (`/shop/catalogue`, `/shop/quote`) :
 * on compose un panier avant de s'identifier. Même throttle resserré qu'eux
 * (60/min/IP) : elle tarife la vitrine quand une règle s'applique.
 * Un `POST` comme le devis : le corps porte le panier.
 */
@Controller("shop/suggestions/cart")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopCartSuggestionsController {
  constructor(private readonly queries: QueryBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  read(
    @Body(new ZodBody(cartSuggestionsPayloadSchema)) payload: CartSuggestionsPayload,
  ): Promise<readonly CartSuggestionView[]> {
    return this.queries.execute<ReadCartSuggestionsQuery, readonly CartSuggestionView[]>(
      new ReadCartSuggestionsQuery(
        null,
        payload.skus,
        payload.target,
        payload.cartTotalCents ?? null,
      ),
    );
  }
}
