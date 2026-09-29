import {
  type DeliverySimulationPayload,
  deliverySimulationPayloadSchema,
  type DeliverySimulationView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { SimulateDeliveryRoundsQuery } from "../application/queries/simulate-delivery-rounds.query.js";

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
}
