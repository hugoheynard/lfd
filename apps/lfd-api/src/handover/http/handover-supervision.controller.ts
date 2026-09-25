import type { HandoverQueueView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetHandoverQueueQuery } from "../application/queries/get-handover-queue.query.js";

/**
 * Le jour de service de la file, validé dans sa FORME.
 *
 * Le poste (`GET admin/handover/file`) lit encore une chaîne brute ; cette
 * porte-ci est neuve, elle naît validée — le message nomme le paramètre, ce dont
 * a besoin celui qui a tapé l'URL.
 */
const supervisionHandoverQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type SupervisionHandoverQuery = z.infer<typeof supervisionHandoverQuerySchema>;

/**
 * **Le retrait vu depuis la Supervision** — la colonne 3, aucun geste
 * (`documentation/order/plan-supervision-du-jour.md`, §3).
 *
 * Une seconde PORTE sur la file du comptoir : même query que
 * `HandoverController.queue`, sous `b2b_supervision` au lieu de `b2b_orders` —
 * qui ouvrirait aussi la confirmation du retrait. Il n'injecte que le
 * `QueryBus`.
 */
@Controller("admin/supervision")
@AdminSurface("b2b_supervision")
export class HandoverSupervisionController {
  constructor(private readonly queries: QueryBus) {}

  @Get("handover")
  handover(
    @Query(new ZodQuery(supervisionHandoverQuerySchema)) query: SupervisionHandoverQuery,
  ): Promise<HandoverQueueView> {
    return this.queries.execute<GetHandoverQueueQuery, HandoverQueueView>(
      new GetHandoverQueueQuery(query.jour),
    );
  }
}
