import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type GeneralOrderCutoffResponse,
  type OrderCutoffPayload,
  orderCutoffPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DefineGeneralOrderCutoffCommand } from "../application/define-general-order-cutoff.command.js";
import { GetGeneralOrderCutoffQuery } from "../application/get-general-order-cutoff.query.js";

/**
 * Gestion **staff** de l'heure limite générale (Réglages › Commandes › Heure
 * limite), sous `lfc_order_settings` (`documentation/commandes/plan-reglages-commandes.md`,
 * §3.4, lot O1a). Surface staff murée par `@AdminSurface`.
 *
 * Une seule ressource depuis le 2026-10-21 : **la règle générale**
 * (`limites-de-commande/schema-des-reglages.md` §4, point 4). Les routes de
 * collection (`GET` liste, `POST`, `PATCH /:id`, `DELETE /:id`) sont retirées :
 * une règle par point ou par jour n'a plus de geste qui la crée, et la
 * générale ne se supprime pas — l'interrupteur l'éteint.
 */
@Controller("admin/order-cutoffs")
@AdminSurface("lfc_order_settings")
export class AdminOrderCutoffsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La règle générale, en vigueur ou non ; `rule: null` tant qu'elle n'est pas posée. */
  @Get("general")
  async general(): Promise<GeneralOrderCutoffResponse> {
    return this.queries.execute<GetGeneralOrderCutoffQuery, GeneralOrderCutoffResponse>(
      new GetGeneralOrderCutoffQuery(),
    );
  }

  /** Pose ou règle la règle générale. Un point ou un jour est refusé (400). */
  @Put("general")
  @HttpCode(HttpStatus.NO_CONTENT)
  async define(
    @Body(new ZodBody(orderCutoffPayloadSchema)) payload: OrderCutoffPayload,
  ): Promise<void> {
    await this.commands.execute<DefineGeneralOrderCutoffCommand, void>(
      new DefineGeneralOrderCutoffCommand(payload),
    );
  }
}
