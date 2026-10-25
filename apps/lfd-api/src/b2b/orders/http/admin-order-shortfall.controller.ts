import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  adminShortfallDecisionPayloadSchema,
  type AdminShortfallDecisionPayload,
} from "@lfd/contracts";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DecideOrderShortfallCommand } from "../application/commands/decide-order-shortfall.command.js";

/**
 * **Le départ incomplet, vu du staff** (lot E6b,
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 12.2). À part de
 * `AdminOrdersController`, qui dépasse déjà la taille d'un fichier.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderShortfallController {
  constructor(private readonly commands: CommandBus) {}

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
}
