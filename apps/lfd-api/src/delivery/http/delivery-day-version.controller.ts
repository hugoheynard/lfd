import { type DayVersionQuery, type DayVersionView, dayVersionQuerySchema } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryDayVersionQuery } from "../application/queries/get-delivery-day-version.query.js";

/**
 * **La version d'une journée de la livraison**
 * (`documentation/livraisons/plan-schema-delivery.md`, SD-D3) — même contrat
 * que `GET admin/production/version`.
 *
 * Lecture ouverte à `delivery_rounds` OU `delivery_loading` : les tournées la
 * suivent, et le panneau des bacs du colisage lit les routes de chargement
 * sous `delivery_loading`. Les deux droits sont tenus par les mêmes rôles
 * (`admin`, `comptoir` — `packages/contracts/src/staff-access.ts`, vérifié le
 * 2026-09-30) ; exiger l'un seul refuserait une dérogation qui n'ouvre que
 * l'autre, pour un simple numéro.
 */
@Controller("admin/livraison")
@AdminSurface("delivery_rounds")
export class DeliveryDayVersionController {
  constructor(private readonly queries: QueryBus) {}

  @Get("version")
  @RequireAnyPermission("delivery_rounds:read", "delivery_loading:read")
  version(
    @Query(new ZodQuery(dayVersionQuerySchema)) query: DayVersionQuery,
  ): Promise<DayVersionView> {
    return this.queries.execute<GetDeliveryDayVersionQuery, DayVersionView>(
      new GetDeliveryDayVersionQuery(query.date),
    );
  }
}
