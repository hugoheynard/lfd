import {
  orderRevisionPayloadSchema,
  orderRevisionQuotePayloadSchema,
  type OrderRevisedResponse,
  type OrderRevisionPayload,
  type OrderRevisionQuotePayload,
  type OrderRevisionQuoteView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  ReviseOrderCommand,
  type ReviseOrderResult,
} from "../application/commands/revise-order.command.js";
import { QuoteOrderRevisionQuery } from "../application/queries/quote-order-revision.query.js";

/**
 * **Le client modifie sa commande** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1) — tant qu'elle
 * n'est pas inscrite au fournil et avant l'heure limite de l'ancienne et de la
 * nouvelle date ; au compte ou à total nul seulement (une commande réglée par
 * carte est refusée en `409`, §9).
 *
 * Le mur se lit sur la commande (`GET :id`) : hors mur, `404`. L'auteur vient
 * du `Principal`, jamais du corps.
 */
@Controller("orders")
export class OrderRevisionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **Ce que la commande modifiée coûterait** — et la révision à renvoyer.
   * Un `POST` bien qu'elle ne mute rien : le panier ne tient pas dans une
   * chaîne de requête. Aucune trace de règle de prix dans la réponse.
   */
  @Post(":id/revisions/quote")
  @HttpCode(HttpStatus.OK)
  async quote(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodBody(orderRevisionQuotePayloadSchema)) payload: OrderRevisionQuotePayload,
  ): Promise<OrderRevisionQuoteView> {
    return this.queries.execute<QuoteOrderRevisionQuery, OrderRevisionQuoteView>(
      new QuoteOrderRevisionQuery(id, { kind: "customer", userId: user.userId }, payload),
    );
  }

  /**
   * **Modifier** : la commande voulue, entière, et la révision corrigée.
   * `200` avec la nouvelle révision ; `409` si elle a changé ailleurs (R7), si
   * la règle refuse, ou pour une commande réglée par carte.
   */
  @Post(":id/revisions")
  @HttpCode(HttpStatus.OK)
  async revise(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodBody(orderRevisionPayloadSchema)) payload: OrderRevisionPayload,
  ): Promise<OrderRevisedResponse> {
    const { expectedRevision, ...content } = payload;
    return this.commands.execute<ReviseOrderCommand, ReviseOrderResult>(
      new ReviseOrderCommand(
        id,
        { kind: "customer", userId: user.userId },
        expectedRevision,
        content,
      ),
    );
  }
}
