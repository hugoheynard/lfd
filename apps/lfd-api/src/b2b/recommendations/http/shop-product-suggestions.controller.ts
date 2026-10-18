import {
  productSuggestionsPayloadSchema,
  type ProductSuggestionsPayload,
  type ProductSuggestionView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadProductSuggestionsQuery } from "../application/queries/read-product-suggestions.query.js";

/**
 * **Les suggestions de la fiche**, sans jeton — le lecteur est un particulier.
 *
 * Publique comme la vitrine et le devis (`/shop/catalogue`, `/shop/quote`) :
 * on compose un panier avant de s'identifier. Même throttle resserré qu'eux
 * (60/min/IP) : elle tarife la vitrine quand une règle s'applique.
 * Un `POST` comme le devis : le corps porte la fiche et le panier.
 */
@Controller("shop/suggestions/product")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopProductSuggestionsController {
  constructor(private readonly queries: QueryBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  read(
    @Body(new ZodBody(productSuggestionsPayloadSchema)) payload: ProductSuggestionsPayload,
  ): Promise<readonly ProductSuggestionView[]> {
    return this.queries.execute<ReadProductSuggestionsQuery, readonly ProductSuggestionView[]>(
      new ReadProductSuggestionsQuery(null, payload.sku, payload.skus, payload.target),
    );
  }
}
