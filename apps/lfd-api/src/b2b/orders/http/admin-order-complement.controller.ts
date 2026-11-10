import { Controller, Delete, HttpCode, HttpStatus, Param } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { AbandonCardIncreaseCommand } from "../application/commands/abandon-card-increase.command.js";

/**
 * **« Abandonner » le complément depuis la fiche** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5) — sous
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
}
