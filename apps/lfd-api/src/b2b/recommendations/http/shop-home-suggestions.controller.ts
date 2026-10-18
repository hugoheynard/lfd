import {
  homeSuggestionsPayloadSchema,
  type HomeSuggestionsPayload,
  type HomeSuggestionView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadHomeSuggestionsQuery } from "../application/queries/read-home-suggestions.query.js";

/**
 * **Les suggestions de l'accueil**, sans jeton — le lecteur est un particulier.
 *
 * Publique, et au même throttle que le panier et la fiche (60/min/IP) : elle
 * tarife la vitrine quand une règle s'applique. Un `POST` : le corps porte le
 * panier, qui n'y sert qu'à exclure.
 */
@Controller("shop/suggestions/home")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopHomeSuggestionsController {
  constructor(private readonly queries: QueryBus) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  read(
    @Body(new ZodBody(homeSuggestionsPayloadSchema)) payload: HomeSuggestionsPayload,
  ): Promise<readonly HomeSuggestionView[]> {
    return this.queries.execute<ReadHomeSuggestionsQuery, readonly HomeSuggestionView[]>(
      new ReadHomeSuggestionsQuery(null, payload.skus, payload.target),
    );
  }
}
