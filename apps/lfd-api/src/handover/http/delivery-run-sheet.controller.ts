import type { DeliveryRunSheetView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryRunSheetQuery } from "../application/queries/get-delivery-run-sheet.query.js";

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const runSheetQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type RunSheetQuery = z.infer<typeof runSheetQuerySchema>;

/**
 * **La feuille de route des livraisons** — lecture seule
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 1).
 *
 * Sous `delivery_run_sheet` depuis le 2026-09-29 (plan, Q7/Q8) : elle était
 * servie sous `b2b_orders`, qui ouvrait les adresses et contacts de TOUTES les
 * livraisons à quiconque prend une commande. `support` et `commercial` en
 * gardent la lecture ; `comptabilite` la perd. Aucun montant. Il n'injecte que
 * le `QueryBus`.
 */
@Controller("admin/livraison")
@AdminSurface("delivery_run_sheet")
export class DeliveryRunSheetController {
  constructor(private readonly queries: QueryBus) {}

  @Get("feuille-de-route")
  runSheet(
    @Query(new ZodQuery(runSheetQuerySchema)) query: RunSheetQuery,
  ): Promise<DeliveryRunSheetView> {
    return this.queries.execute<GetDeliveryRunSheetQuery, DeliveryRunSheetView>(
      new GetDeliveryRunSheetQuery(query.jour),
    );
  }
}
