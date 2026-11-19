import {
  adminOrderRevisionPayloadSchema,
  type AdminOrderRevisionPayload,
  type OrderRevisionEntryView,
  orderRevisionQuotePayloadSchema,
  type OrderRevisedResponse,
  type OrderRevisionQuotePayload,
  type OrderRevisionQuoteView,
  type StaffPermission,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequirePermission,
} from "../../../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions, StaffUserId } from "../../../../platform/auth/staff.decorator.js";
import { mayExceedItemLimits } from "../../http/item-limit-override-permissions.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import {
  ReviseOrderCommand,
  type ReviseOrderResult,
} from "../application/commands/revise-order.command.js";
import { ListOrderRevisionsQuery } from "../application/queries/list-order-revisions.query.js";
import { QuoteOrderRevisionQuery } from "../application/queries/quote-order-revision.query.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";

/**
 * **L'équipe modifie une commande** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») — heure limite
 * générale ignorée, jusqu'à l'inscription au fournil, au compte ou à total nul
 * seulement (§ 2.7). La limite propre d'un produit ajouté ou augmenté, elle,
 * est opposée ; le droit `lfc_product_limit_override`, lu en base
 * (`@StaffPermissions()`), la fait passer outre quand le produit le permet,
 * avec un motif.
 *
 * Sous `b2b_place_order:write`, le droit de composer une commande pour un
 * client : la modification reprend le même parcours que la saisie (§ 2.2). Le
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
   * **Les versions précédentes** (§ 2.2) : chaque modification, la plus récente
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

  /**
   * Le devis de révision — même recomposition que la modification. Il lit le
   * droit de passer outre pour annoncer les limites que la modification
   * dépasserait (`itemLimitOverrides`), sans exiger de motif.
   */
  @Post(":id/revisions/quote")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.OK)
  @Idempotent("calcul pur en POST : chiffre la révision en mémoire, n'écrit rien et n'envoie rien")
  async quote(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(orderRevisionQuotePayloadSchema)) payload: OrderRevisionQuotePayload,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<OrderRevisionQuoteView> {
    return this.queries.execute<QuoteOrderRevisionQuery, OrderRevisionQuoteView>(
      new QuoteOrderRevisionQuery(
        id,
        { kind: "staff", staffId: staffUserId },
        payload,
        mayExceedItemLimits(permissions),
      ),
    );
  }

  /** Modifier : `200` avec la nouvelle révision ; les refus sont des `409` qui portent leur phrase. */
  @Post(":id/revisions")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.OK)
  @Idempotent(
    "par sa propre clé : expectedRevision, obligatoire au corps, rejugé sous le verrou de la commande ; rejouée, la révision l'a fait monter et la requête est refusée (409 OrderRevisedElsewhereError) avant toute écriture, tout fait ni tout remboursement",
  )
  async revise(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(adminOrderRevisionPayloadSchema)) payload: AdminOrderRevisionPayload,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<OrderRevisedResponse> {
    const { expectedRevision, expectedTotalCents, itemLimitOverrideReason, ...content } = payload;
    return this.commands.execute<ReviseOrderCommand, ReviseOrderResult>(
      new ReviseOrderCommand(
        id,
        { kind: "staff", staffId: staffUserId },
        expectedRevision,
        content,
        expectedTotalCents,
        "direct",
        {
          exceedItemLimits: mayExceedItemLimits(permissions),
          overrideReason: itemLimitOverrideReason,
        },
      ),
    );
  }
}
