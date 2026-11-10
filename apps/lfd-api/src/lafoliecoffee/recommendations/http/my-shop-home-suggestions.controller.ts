import {
  homeSuggestionsPayloadSchema,
  type HomeSuggestionsPayload,
  type HomeSuggestionView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadHomeSuggestionsQuery } from "../application/queries/read-home-suggestions.query.js";

/**
 * **Les suggestions de l'accueil d'une personne reconnue** — à part de la
 * route publique, comme le panier et la fiche : une classe `@Public()` ne
 * porte pas une route murée. La société vient du contexte de la requête.
 */
@Controller("shop/suggestions/home")
export class MyShopHomeSuggestionsController {
  constructor(private readonly queries: QueryBus) {}

  @Post("mine")
  @HttpCode(HttpStatus.OK)
  read(
    @Body(new ZodBody(homeSuggestionsPayloadSchema)) payload: HomeSuggestionsPayload,
    @ActingCompany() companyId: string | null,
  ): Promise<readonly HomeSuggestionView[]> {
    return this.queries.execute<ReadHomeSuggestionsQuery, readonly HomeSuggestionView[]>(
      new ReadHomeSuggestionsQuery(companyId, payload.skus, payload.target),
    );
  }
}
