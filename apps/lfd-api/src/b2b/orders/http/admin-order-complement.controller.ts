import { Controller, Delete, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { AbandonCardIncreaseCommand } from "../revision/application/commands/abandon-card-increase.command.js";
import { RelaunchCardIncreaseCommand } from "../revision/application/commands/relaunch-card-increase.command.js";

/**
 * **« Abandonner » le complément depuis la fiche** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.4), et
 * **« Relancer »** celui qui est en panne (§2.6) — sous
 * `b2b_orders:write`, le droit qui modifie une commande. L'auteur vient de la
 * porte (`@StaffUserId()`), jamais du corps ; aucun e-mail ne part.
 */
@Controller("admin/orders")
@AdminSurface("b2b_orders")
export class AdminOrderComplementController {
  constructor(private readonly commands: CommandBus) {}

  /** `204` ; `409` s'il n'y a rien à abandonner, ou si le complément vient d'être payé. */
  @Delete(":id/complement")
  @HttpCode(HttpStatus.NO_CONTENT)
  async abandon(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<AbandonCardIncreaseCommand, void>(
      new AbandonCardIncreaseCommand(id, { kind: "staff", staffId: staffUserId }),
    );
  }

  /**
   * **« Relancer »** un complément payé en panne (§2.6, étape 5) : `204`, et
   * l'exécuteur repart après validation ; `409` s'il n'y a rien en panne.
   */
  @Post(":id/card-increase/relaunch")
  @HttpCode(HttpStatus.NO_CONTENT)
  async relaunch(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RelaunchCardIncreaseCommand, void>(
      new RelaunchCardIncreaseCommand(id),
    );
  }
}
