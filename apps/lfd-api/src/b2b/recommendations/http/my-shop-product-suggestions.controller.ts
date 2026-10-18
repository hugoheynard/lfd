import {
  productSuggestionsPayloadSchema,
  type ProductSuggestionsPayload,
  type ProductSuggestionView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadProductSuggestionsQuery } from "../application/queries/read-product-suggestions.query.js";

/**
 * **Les suggestions de la fiche d'une personne reconnue** — à part de la route
 * publique pour la raison de `MyShopCatalogueController` : une classe
 * `@Public()` ne porte pas une route murée. La société vient du contexte de
 * la requête, jamais de l'URL ; sans société (espace perso), le lecteur est
 * un particulier, comme la vitrine.
 */
@Controller("shop/suggestions/product")
export class MyShopProductSuggestionsController {
  constructor(private readonly queries: QueryBus) {}

  @Post("mine")
  @HttpCode(HttpStatus.OK)
  read(
    @Body(new ZodBody(productSuggestionsPayloadSchema)) payload: ProductSuggestionsPayload,
    @ActingCompany() companyId: string | null,
  ): Promise<readonly ProductSuggestionView[]> {
    return this.queries.execute<ReadProductSuggestionsQuery, readonly ProductSuggestionView[]>(
      new ReadProductSuggestionsQuery(companyId, payload.sku, payload.skus, payload.target),
    );
  }
}
