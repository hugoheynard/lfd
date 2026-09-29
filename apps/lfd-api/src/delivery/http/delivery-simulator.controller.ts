import {
  type DeliverySimulationFromDayView,
  type DeliverySimulationPayload,
  deliverySimulationPayloadSchema,
  type DeliverySimulationView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetSimulationFromDayQuery } from "../application/queries/get-simulation-from-day.query.js";
import { SimulateDeliveryRoundsQuery } from "../application/queries/simulate-delivery-rounds.query.js";

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const dayQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type DayQuery = z.infer<typeof dayQuerySchema>;

/**
 * **Le simulateur de tournée** — Livraison → Simulateur
 * (`plan-preparation-de-tournee.md`, lot 9).
 *
 * Un `POST` parce que le scénario est un corps, pas parce qu'on écrit (L9-C1) :
 * la route se lit sous `delivery_rounds:read`. Il n'injecte que le bus.
 */
@Controller("admin/livraison/simulateur")
@AdminSurface("delivery_rounds")
export class DeliverySimulatorController {
  constructor(private readonly queries: QueryBus) {}

  /** Une proposition sur des arrêts inventés : rien n'est écrit, rien n'est géocodé. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermission("delivery_rounds:read")
  simulate(
    @Body(new ZodBody(deliverySimulationPayloadSchema)) payload: DeliverySimulationPayload,
  ): Promise<DeliverySimulationView> {
    return this.queries.execute<SimulateDeliveryRoundsQuery, DeliverySimulationView>(
      new SimulateDeliveryRoundsQuery(payload),
    );
  }

  /**
   * **Partir d'une vraie journée** (L9-C8) : ses livraisons COPIÉES en arrêts
   * inventés, sans identifiant de commande. Sous `delivery_rounds:read`, le
   * droit qui montre déjà ces noms.
   */
  @Get("depuis-journee")
  fromDay(
    @Query(new ZodQuery(dayQuerySchema)) query: DayQuery,
  ): Promise<DeliverySimulationFromDayView> {
    return this.queries.execute<GetSimulationFromDayQuery, DeliverySimulationFromDayView>(
      new GetSimulationFromDayQuery(query.jour),
    );
  }
}
