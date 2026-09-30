import {
  type PurchaseAssistantPayload,
  purchaseAssistantPayloadSchema,
  type PurchaseAssistantView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { AssistBinPurchaseQuery } from "../application/queries/assist-bin-purchase.query.js";

/**
 * **L'assistant d'achat** — combien de bacs de tel format tiennent dans tel
 * plancher (`plan-geometrie-du-plancher.md`, G-D3).
 *
 * Un `POST` parce que le scénario est un corps, pas parce qu'on écrit : la
 * route se lit sous `delivery_rounds:read`, le droit du simulateur — pas de
 * droit neuf. Il n'injecte que le bus.
 */
@Controller("admin/livraison/assistant-achat")
@AdminSurface("delivery_rounds")
export class DeliveryPurchaseAssistantController {
  constructor(private readonly queries: QueryBus) {}

  /** Le meilleur rangement par rangées de chaque format : rien n'est lu, rien n'est écrit. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermission("delivery_rounds:read")
  assist(
    @Body(new ZodBody(purchaseAssistantPayloadSchema)) payload: PurchaseAssistantPayload,
  ): Promise<PurchaseAssistantView> {
    return this.queries.execute<AssistBinPurchaseQuery, PurchaseAssistantView>(
      new AssistBinPurchaseQuery(payload),
    );
  }
}
