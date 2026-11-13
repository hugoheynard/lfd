import type { CockpitHandoversView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetCockpitHandoversQuery } from "../application/queries/get-cockpit-handovers.query.js";

const cockpitHandoversQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type CockpitHandoversQuery = z.infer<typeof cockpitHandoversQuerySchema>;

/**
 * **Les remises du jour vues du cockpit commercial** — deux compteurs par
 * acheminement, aucune commande, aucune tournée.
 *
 * Une troisième PORTE sur la journée du retrait, comme
 * `HandoverSupervisionController` : elle vit ici, avec les données qu'elle
 * compte, et prend le droit du cockpit (`b2b_growth`, celui de
 * `admin/cockpit`) — le commercial n'a pas à tenir `handover_counter`, qui
 * ouvrirait aussi la confirmation du retrait. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/cockpit")
@AdminSurface("b2b_growth")
export class HandoverCockpitController {
  constructor(private readonly queries: QueryBus) {}

  @Get("handovers")
  handovers(
    @Query(new ZodQuery(cockpitHandoversQuerySchema)) query: CockpitHandoversQuery,
  ): Promise<CockpitHandoversView> {
    return this.queries.execute<GetCockpitHandoversQuery, CockpitHandoversView>(
      new GetCockpitHandoversQuery(query.jour),
    );
  }
}
