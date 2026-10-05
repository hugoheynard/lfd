import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ClosePackingOrderCommand } from "../application/station/close-packing-order.command.js";
import { ReopenPackingOrderCommand } from "../application/station/reopen-packing-order.command.js";
import { packingDayOf } from "./packing-day-path.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit le poste. */
const NO_CONTENT = 204;

/**
 * **Fermer et rouvrir une commande au colisage** (plan
 * `colisage/plan-domaine-colisage.md`, §17.2, K3a).
 *
 * - `POST …/close` — « Déclarer prête » : le bac fermé, `packing.order_packed`
 *   publié dans la même transaction ;
 * - `POST …/reopen` — rouvrir le rangement seulement (option b de Hugo) :
 *   refusé si un bac est chargé ou la tournée partie ; la commande reste
 *   « prête » au commerce.
 *
 * Sous `production_packing` (`write`). Les deux rendent `204` : l'écran relit
 * `GET admin/packing/:date/board`. Il n'injecte que le `CommandBus`.
 */
@Controller("admin/packing/:date/orders/:orderId")
@AdminSurface("production_packing")
export class PackingOrdersController {
  constructor(private readonly commands: CommandBus) {}

  @Post("close")
  @HttpCode(NO_CONTENT)
  async close(
    @Param("date") date: string,
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ClosePackingOrderCommand, void>(
      new ClosePackingOrderCommand(packingDayOf(date), orderId, staffUserId),
    );
  }

  @Post("reopen")
  @HttpCode(NO_CONTENT)
  async reopen(@Param("date") date: string, @Param("orderId") orderId: string): Promise<void> {
    await this.commands.execute<ReopenPackingOrderCommand, void>(
      new ReopenPackingOrderCommand(packingDayOf(date), orderId),
    );
  }
}
