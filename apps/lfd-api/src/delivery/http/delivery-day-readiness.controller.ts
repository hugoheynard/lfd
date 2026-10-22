import type { DeliveryCompositionGapsView, DeliveryDayReadinessView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetCompositionGapsQuery } from "../application/queries/get-composition-gaps.query.js";
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

  /**
   * **Ce qui empêche, maintenant, de composer** (2026-10-22) : sans jour, la
   * flotte et les bacs entiers. Le Tour manager et la Supervision l'affichent ;
   * liste vide, rien ne s'affiche.
   */
  @Get("composition-gaps")
  compositionGaps(): Promise<DeliveryCompositionGapsView> {
    return this.queries.execute<GetCompositionGapsQuery, DeliveryCompositionGapsView>(
      new GetCompositionGapsQuery(),
    );
  }
}
