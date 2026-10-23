import {
  type OrderChangeAppliedResponse,
  type OrderChangeRefusalPayload,
  orderChangeRefusalPayloadSchema,
  type OrderRevisionQuoteView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ApplyOrderChangeCommand } from "../application/commands/apply-order-change.command.js";
import { RefuseOrderChangeCommand } from "../application/commands/refuse-order-change.command.js";
import { QuoteOrderChangeQuery } from "../application/queries/quote-order-change.query.js";

/**
 * **Répondre à une demande de modification** dans la boîte « Demandes
 * clients » (plan `documentation/commandes/plan-modifier-une-commande.md`,
 * M4), sous le droit de la boîte, `b2b_contact` : l'écart, puis « Appliquer »
 * — une révision au nom de l'équipe — ou « Refuser » avec un mot.
 */
@Controller("admin/customer-requests/:id/order-change")
@AdminSurface("b2b_contact")
export class AdminOrderChangeRequestsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Le devis de révision de la demande en attente, ou le refus de la règle (`409`). */
  @Get("quote")
  quote(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
  ): Promise<OrderRevisionQuoteView> {
    return this.queries.execute<QuoteOrderChangeQuery, OrderRevisionQuoteView>(
      new QuoteOrderChangeQuery(id, staffUserId),
    );
  }

  /** `200` avec la révision produite ; `409` avec la phrase de la règle (inscrite, modifiée ailleurs…). */
  @Post("apply")
  @HttpCode(HttpStatus.OK)
  async apply(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
  ): Promise<OrderChangeAppliedResponse> {
    const revision = await this.commands.execute<ApplyOrderChangeCommand, number>(
      new ApplyOrderChangeCommand(id, staffUserId),
    );
    return { revision };
  }

  @Post("refuse")
  @HttpCode(HttpStatus.NO_CONTENT)
  async refuse(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(orderChangeRefusalPayloadSchema)) payload: OrderChangeRefusalPayload,
  ): Promise<void> {
    await this.commands.execute<RefuseOrderChangeCommand, void>(
      new RefuseOrderChangeCommand(id, staffUserId, payload.reason),
    );
  }
}
