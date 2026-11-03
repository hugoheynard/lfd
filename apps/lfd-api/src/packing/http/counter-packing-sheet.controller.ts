import type { CounterPackingSheetView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { GetCounterPackingSheetQuery } from "../application/counter/get-counter-packing-sheet.query.js";

/**
 * **La fiche de colis d'une commande, servie au comptoir** (2026-11-03).
 *
 * Sous `handover_counter` — le droit du poste qui remet. Le board du colisage
 * (`production_packing` ou `b2b_supervision`) refusait le vendeur, et le rail
 * proposait alors une remise complète sur un sac incomplet. Il n'injecte que
 * le `QueryBus`.
 */
@Controller("admin/counter/orders/:orderId")
@AdminSurface("handover_counter")
export class CounterPackingSheetController {
  constructor(private readonly queries: QueryBus) {}

  @Get("packing-sheet")
  sheet(@Param("orderId") orderId: string): Promise<CounterPackingSheetView> {
    return this.queries.execute<GetCounterPackingSheetQuery, CounterPackingSheetView>(
      new GetCounterPackingSheetQuery(orderId),
    );
  }
}
