import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { RetryOrderRefundCommand } from "../application/commands/retry-order-refund.command.js";

/**
 * **Le remboursement d'une commande annulée, vu du staff** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.9). À part de
 * `AdminOrdersController`, qui dépasse déjà la taille d'un fichier.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderRefundsController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * **« Relancer le remboursement »**. `202` : la route n'attend PAS Stripe —
   * elle vérifie l'état, rend la demande à l'exécuteur et répond ; l'écran
   * relit (`GET :id`). Sous le droit qui a créé la demande
   * (`b2b_cancel_order:write`) ; pas de ressource neuve.
   *
   * Refus : pas de demande (404), déjà remboursée, émise et en attente de la
   * banque, Stripe la traite déjà (409, avec leur phrase).
   */
  @Post(":id/refund/retry")
  @RequirePermission("b2b_cancel_order:write")
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RetryOrderRefundCommand, void>(new RetryOrderRefundCommand(id));
  }
}
