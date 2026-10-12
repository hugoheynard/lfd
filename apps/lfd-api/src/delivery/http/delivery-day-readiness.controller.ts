import type { DeliveryDayReadinessView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryDayReadinessQuery } from "../application/queries/get-delivery-day-readiness.query.js";

const dayQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "day attendu au format AAAA-MM-JJ"),
});
type DayQuery = z.infer<typeof dayQuerySchema>;

/**
 * **Le plan arrêté d'une journée**, pour l'écran des tournées (plan de
 * composition automatique, §16.5, S5) — une lecture sous `delivery_rounds`.
 * Il n'injecte que le bus.
 */
@Controller("admin/delivery/rounds")
@AdminSurface("delivery_rounds")
export class DeliveryDayReadinessController {
  constructor(private readonly queries: QueryBus) {}

  @Get("plan-stopped")
  readiness(
    @Query(new ZodQuery(dayQuerySchema)) query: DayQuery,
  ): Promise<DeliveryDayReadinessView> {
    return this.queries.execute<GetDeliveryDayReadinessQuery, DeliveryDayReadinessView>(
      new GetDeliveryDayReadinessQuery(query.day),
    );
  }
}
