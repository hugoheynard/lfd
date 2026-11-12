import {
  type OrderChangeAppliedResponse,
  type OrderChangeApplyPayload,
  orderChangeApplyPayloadSchema,
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
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * **Répondre à une demande de modification** dans la boîte « Demandes
 * clients » (voir `documentation/commandes/modification/modifier-une-commande.md`,
 * § 2.5 « La demande après l'heure limite » (M4)), sous le droit de la boîte, `b2b_contact` : l'écart, puis « Appliquer »
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

  /**
   * `200` avec la révision produite ; `409` avec la phrase de la règle
   * (inscrite, modifiée ailleurs, total changé depuis le devis vu…).
   */
  @Post("apply")
  @HttpCode(HttpStatus.OK)
  @Idempotent(
    "transition : rejouée, la demande relue sous verrou est déjà traitée et l'agrégat refuse (409, ensureUnhandled) avant toute révision, tout courriel ni fait",
  )
  async apply(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(orderChangeApplyPayloadSchema)) payload: OrderChangeApplyPayload,
  ): Promise<OrderChangeAppliedResponse> {
    const revision = await this.commands.execute<ApplyOrderChangeCommand, number>(
      new ApplyOrderChangeCommand(id, staffUserId, payload.expectedTotalCents),
    );
    return { revision };
  }

  @Post("refuse")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "transition : rejouée, la demande relue sous verrou est déjà traitée et l'agrégat refuse (409, ensureUnhandled) avant toute écriture, tout courriel ni fait",
  )
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
