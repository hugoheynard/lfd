import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { RefundShortfallCommand } from "../application/commands/refund-shortfall.command.js";

/**
 * **« Rembourser le reste »** d'un départ incomplet payé par carte (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5) — sous
 * la commande, comme les autres gestes de la fiche (`b2b_orders`), mais sous
 * la permission des remboursements par carte : c'est de l'argent qui part.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderShortfallRefundController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * `202` : la demande est écrite, l'exécuteur du bloc carte part après
   * validation ; l'écran relit la fiche. Refus : commande inconnue (404) ;
   * une cause qui bloque encore, ou rien à rembourser (409, avec leur
   * phrase). Une fois par intention (`Idempotency-Key`).
   */
  @Post(":orderId/shortfall-refund")
  @RequirePermission("card_payments:write")
  @HttpCode(HttpStatus.ACCEPTED)
  async refund(
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RefundShortfallCommand, void>(
      new RefundShortfallCommand(orderId, staffUserId, intentKey),
    );
  }
}
