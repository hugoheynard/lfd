import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { WakeRoadRoutingCommand } from "../application/commands/wake-road-routing.command.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/**
 * **Réveiller le calcul routier** — appelé par le back-office à l'ouverture
 * du Tour manager (2026-11-01). `202` : le réveil est lancé, pas achevé.
 *
 * Sous `delivery_rounds:read`, le droit qui ouvre l'écran des tournées : un
 * `POST` qui n'écrit rien, d'où {@link RequirePermission} plutôt que le
 * `write` que le verbe impliquerait.
 */
@Controller("admin/delivery/road-routing")
@AdminSurface("delivery_rounds")
export class RoadRoutingWakeController {
  constructor(private readonly commands: CommandBus) {}

  @Post("wake")
  @Idempotent(
    "réveille le moteur d'itinéraires sans rien écrire ; rejoué dans l'intervalle, le réveil ne repart même pas",
  )
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission("delivery_rounds:read")
  async wake(): Promise<void> {
    await this.commands.execute<WakeRoadRoutingCommand, void>(new WakeRoadRoutingCommand());
  }
}
