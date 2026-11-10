import {
  type CardComplementPaymentView,
  type CardIncreasePayload,
  cardIncreasePayloadSchema,
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
import { ProposeCardIncreaseCommand } from "../application/commands/propose-card-increase.command.js";
import {
  ReviseOrderCommand,
  type ReviseOrderResult,
} from "../application/commands/revise-order.command.js";
import { QuoteOrderChangeRequestQuery } from "../application/queries/quote-order-change-request.query.js";
import { QuoteOrderRevisionQuery } from "../application/queries/quote-order-revision.query.js";

/**
 * **Le client modifie sa commande** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») — tant qu'elle
 * n'est pas inscrite au fournil et avant l'heure limite de l'ancienne et de la
 * nouvelle date ; au compte ou à total nul seulement (une commande réglée par
 * carte est refusée en `409`, § 2.7).
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
   * **Ce que la DEMANDE coûterait** (M4, § 2.5) — après l'heure limite
   * seulement : un devis indicatif, aux règles de l'équipe qui l'appliquera.
   * `409` hors de ce cas, `404` hors mur. Ne mute rien.
   */
  @Post(":id/revisions/change-request-quote")
  @HttpCode(HttpStatus.OK)
  async quoteChangeRequest(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodBody(orderRevisionQuotePayloadSchema)) payload: OrderRevisionQuotePayload,
  ): Promise<OrderRevisionQuoteView> {
    return this.queries.execute<QuoteOrderChangeRequestQuery, OrderRevisionQuoteView>(
      new QuoteOrderChangeRequestQuery(id, user.userId, payload),
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
    const { expectedRevision, expectedTotalCents, ...content } = payload;
    return this.commands.execute<ReviseOrderCommand, ReviseOrderResult>(
      new ReviseOrderCommand(
        id,
        { kind: "customer", userId: user.userId },
        expectedRevision,
        content,
        expectedTotalCents,
        "direct",
      ),
    );
  }

  /**
   * **Demander une hausse d'une commande payée par carte** (doc
   * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.3) — le
   * même corps que la modification, total vu obligatoire (R14). `200` avec le
   * complément à payer et de quoi monter le formulaire de carte ; la commande
   * ne change qu'une fois le complément payé. `409` : baisse ou total égal
   * (`orders.revise.card_settled`), total changé (`orders.total_changed`),
   * un complément d'un autre auteur en attente (`orders.card_increase.pending`).
   * Le client seul (R15) : l'équipe n'a pas cette route.
   */
  @Post(":id/revisions/card-increase")
  @HttpCode(HttpStatus.OK)
  async proposeCardIncrease(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodBody(cardIncreasePayloadSchema)) payload: CardIncreasePayload,
  ): Promise<CardComplementPaymentView> {
    const { expectedRevision, expectedTotalCents, ...content } = payload;
    return this.commands.execute<ProposeCardIncreaseCommand, CardComplementPaymentView>(
      new ProposeCardIncreaseCommand(
        id,
        { kind: "customer", userId: user.userId },
        expectedRevision,
        content,
        expectedTotalCents,
      ),
    );
  }
}
