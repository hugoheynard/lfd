import {
  type OrderRevisionEntryView,
  orderRevisionPayloadSchema,
  orderRevisionQuotePayloadSchema,
  type OrderRevisedResponse,
  type OrderRevisionPayload,
  type OrderRevisionQuotePayload,
  type OrderRevisionQuoteView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  ReviseOrderCommand,
  type ReviseOrderResult,
} from "../application/commands/revise-order.command.js";
import { ListOrderRevisionsQuery } from "../application/queries/list-order-revisions.query.js";
import { QuoteOrderRevisionQuery } from "../application/queries/quote-order-revision.query.js";

/**
 * **L'équipe modifie une commande** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1) — heure limite
 * ignorée, jusqu'à l'inscription au fournil, au compte ou à total nul
 * seulement (§9).
 *
 * Sous `b2b_place_order:write`, le droit de composer une commande pour un
 * client : la modification reprend le même parcours que la saisie (§6). Le
 * plan ne nomme pas de droit à part (signalé au rapport du lot M1). L'auteur
 * vient de la porte (`@StaffUserId()`, l'id de la fiche), jamais du corps.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderRevisionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **Les versions précédentes** (§6) : chaque modification, la plus récente
   * en tête, avec la composition qu'elle a remplacée. Un `GET` : le droit de
   * LIRE les commandes (`b2b_orders:read`, celui de la fiche), pas celui de
   * les composer.
   */
  @Get(":id/revisions")
  revisions(@Param("id") id: string): Promise<readonly OrderRevisionEntryView[]> {
    return this.queries.execute<ListOrderRevisionsQuery, readonly OrderRevisionEntryView[]>(
      new ListOrderRevisionsQuery(id),
    );
  }

  /** Le devis de révision — même recomposition que la modification. */
  @Post(":id/revisions/quote")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.OK)
  async quote(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(orderRevisionQuotePayloadSchema)) payload: OrderRevisionQuotePayload,
  ): Promise<OrderRevisionQuoteView> {
    return this.queries.execute<QuoteOrderRevisionQuery, OrderRevisionQuoteView>(
      new QuoteOrderRevisionQuery(id, { kind: "staff", staffId: staffUserId }, payload),
    );
  }

  /** Modifier : `200` avec la nouvelle révision ; les refus sont des `409` qui portent leur phrase. */
  @Post(":id/revisions")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.OK)
  async revise(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(orderRevisionPayloadSchema)) payload: OrderRevisionPayload,
  ): Promise<OrderRevisedResponse> {
    const { expectedRevision, ...content } = payload;
    return this.commands.execute<ReviseOrderCommand, ReviseOrderResult>(
      new ReviseOrderCommand(
        id,
        { kind: "staff", staffId: staffUserId },
        expectedRevision,
        content,
      ),
    );
  }
}
