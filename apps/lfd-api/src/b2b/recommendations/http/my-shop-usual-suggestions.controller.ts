import {
  usualSuggestionsPayloadSchema,
  type UsualSuggestionsPayload,
  type UsualSuggestionView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListMyUsualsQuery } from "../application/queries/list-my-usuals.query.js";

/**
 * **« Vos habituels »** (R1) — la route murée SEULE : il n'y a pas de route
 * publique, un invité n'a pas d'historique à qui le montrer. La société vient
 * du contexte de la requête (résolue en base par `AuthGuard`), jamais du
 * corps ; sans société, la réponse est vide.
 */
@Controller("shop/suggestions/usuals")
export class MyShopUsualSuggestionsController {
  constructor(private readonly queries: QueryBus) {}

  @Post("mine")
  @HttpCode(HttpStatus.OK)
  read(
    @Body(new ZodBody(usualSuggestionsPayloadSchema)) payload: UsualSuggestionsPayload,
    @ActingCompany() companyId: string | null,
  ): Promise<readonly UsualSuggestionView[]> {
    return this.queries.execute<ListMyUsualsQuery, readonly UsualSuggestionView[]>(
      new ListMyUsualsQuery(companyId, payload.skus, payload.target),
    );
  }
}
