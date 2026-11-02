import type { FulfillmentDayView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListFulfillmentDaysQuery } from "../application/list-fulfillment-days.query.js";
import { cartSkusOf, cartSkusQuerySchema } from "./fulfillment-days.controller.js";

/**
 * **Les journées d'un client reconnu** (plan du jour J, bâti des restes) :
 * la porte du jour même et la clientèle des opérations viennent de la société
 * agissante, comme à la passation — jamais d'un paramètre. Un contrôleur à
 * part de `FulfillmentDaysController`, qui est `@Public()` au niveau de la
 * classe : celui-ci est muré. Aucun `?audience=`.
 */
@Controller("fulfillment-days")
export class MyFulfillmentDaysController {
  constructor(private readonly queries: QueryBus) {}

  /** `?skus=PAT-002,VIE-001` — le panier, facultatif. */
  @Get("mine")
  list(
    @ActingCompany() companyId: string | null,
    @Query("skus", new ZodQuery(cartSkusQuerySchema)) skus: string | undefined,
  ): Promise<readonly FulfillmentDayView[]> {
    return this.queries.execute<ListFulfillmentDaysQuery, readonly FulfillmentDayView[]>(
      new ListFulfillmentDaysQuery(cartSkusOf(skus), { kind: "acting", companyId }),
    );
  }
}
