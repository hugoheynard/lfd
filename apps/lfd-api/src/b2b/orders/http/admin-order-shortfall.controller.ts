import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  adminShortfallDecisionPayloadSchema,
  adminShortfallLetterPayloadSchema,
  type AdminShortfallDecisionPayload,
  type AdminShortfallLetterDraft,
  type AdminShortfallLetterPayload,
} from "@lfd/contracts";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DecideOrderShortfallCommand } from "../application/commands/decide-order-shortfall.command.js";
import { WriteShortfallLetterCommand } from "../application/commands/write-shortfall-letter.command.js";
import { GetShortfallLetterDraftQuery } from "../application/queries/get-shortfall-letter-draft.query.js";

/**
 * **Le départ incomplet, vu du staff** (lot E6b,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.2). À part de
 * `AdminOrdersController`, qui dépasse déjà la taille d'un fichier.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderShortfallController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **« Décider du départ »**. Corps `{ remainder: "abandoned" }` — les
   * quantités ne voyagent pas. Sous `b2b_orders_shortfall:write` ; l'auteur
   * vient de la porte. `204` : la commande se relit (`GET :id`).
   *
   * Refus (`409`, avec leur phrase) : déjà décidée, aucun manque signalé, pas
   * confirmée, carte, bon de fidélité, trop ancienne, rien au bac, bac déjà
   * fermé, bac changé depuis le signal.
   */
  @Post(":id/shortfall-decision")
  @RequirePermission("b2b_orders_shortfall:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async decide(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(adminShortfallDecisionPayloadSchema)) payload: AdminShortfallDecisionPayload,
  ): Promise<void> {
    await this.commands.execute<DecideOrderShortfallCommand, void>(
      new DecideOrderShortfallCommand(id, staffUserId, payload.remainder),
    );
  }

  /**
   * **La proposition « Écrire au client »** (lot E6d) : le texte pré-rempli
   * que l'équipe relit. Sous la même permission que la décision. Refus
   * (`409`) : départ non décidé, client déjà prévenu.
   */
  @Get(":id/shortfall-letter")
  @RequirePermission("b2b_orders_shortfall:write")
  async draftLetter(@Param("id") id: string): Promise<AdminShortfallLetterDraft> {
    return this.queries.execute<GetShortfallLetterDraftQuery, AdminShortfallLetterDraft>(
      new GetShortfallLetterDraftQuery(id),
    );
  }

  /**
   * **« Écrire au client »** (lot E6d) : envoie le texte RELU, une fois par
   * décision. `204` : la commande se relit (« Client prévenu le … par … »).
   * Refus : texte vide ou trop long (`400`), départ non décidé, client déjà
   * prévenu, sans adresse (`409`), envoi refusé par le fournisseur (`500`,
   * rien n'est tracé).
   */
  @Post(":id/shortfall-letter")
  @RequirePermission("b2b_orders_shortfall:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  async writeLetter(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(adminShortfallLetterPayloadSchema)) payload: AdminShortfallLetterPayload,
  ): Promise<void> {
    await this.commands.execute<WriteShortfallLetterCommand, void>(
      new WriteShortfallLetterCommand(id, staffUserId, payload.message),
    );
  }
}
