import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  orderDeliveryVatPayloadSchema,
  type OrderDeliveryVatPayload,
  type OrderDeliveryVatView,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../../platform/auth/staff-principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadOrderDeliveryVatQuery } from "../application/read-order-delivery-vat.query.js";
import { SaveOrderDeliveryVatCommand } from "../application/save-order-delivery-vat.command.js";

/**
 * **La TVA de la livraison** — Comptabilité › « TVA de la livraison » (plan
 * `documentation/order/plan-tva-des-frais-de-port.md`, V2).
 *
 * Murée par `b2b_accounting`, comme les autres réglages de la comptabilité :
 * c'est le comptable qui sait si le transport est l'accessoire de la vente ou
 * une prestation distincte. Pas de `DELETE` : revenir au taux normal est un
 * choix, il se pose (`standard`) — retirer la ligne ferait passer une décision
 * pour un repli.
 */
@Controller("admin/order-delivery-vat")
@AdminSurface("b2b_accounting")
export class AdminOrderDeliveryVatController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Le mode qui s'applique, et s'il a été choisi. */
  @Get()
  async read(): Promise<OrderDeliveryVatView> {
    return this.queries.execute<ReadOrderDeliveryVatQuery, OrderDeliveryVatView>(
      new ReadOrderDeliveryVatQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(
    @Req() request: AuthenticatedStaffRequest,
    @Body(new ZodBody(orderDeliveryVatPayloadSchema)) payload: OrderDeliveryVatPayload,
  ): Promise<void> {
    await this.commands.execute<SaveOrderDeliveryVatCommand, void>(
      new SaveOrderDeliveryVatCommand(payload.mode, staffUserIdOf(request)),
    );
  }
}

/** Qui a réglé, résolu par `StaffAccessGuard`. Un choix fiscal sans auteur ne se relit pas. */
function staffUserIdOf(request: AuthenticatedStaffRequest): string {
  const staffUserId = request.access?.staffUserId;
  if (staffUserId === undefined || staffUserId === "") {
    throw new UnauthorizedException("Identité staff absente de la requête.");
  }
  return staffUserId;
}
