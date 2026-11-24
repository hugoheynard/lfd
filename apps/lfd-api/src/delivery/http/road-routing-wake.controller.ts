import { Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { RoadRoutingReadinessView } from "@lfd/contracts";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { WakeRoadRoutingCommand } from "../application/commands/wake-road-routing.command.js";
import { GetRoadRoutingReadinessQuery } from "../application/queries/get-road-routing-readiness.query.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/**
 * **Réveiller le calcul routier, et savoir s'il est prêt** — appelé par le
 * back-office à l'ouverture du Tour manager : `POST wake` lance le réveil
 * (`202`, lancé, pas achevé) ; `GET readiness` est sondé toutes les ~3 s, et
 * l'écran voile ses tournées tant qu'il répond `false`.
 *
 * Sous `delivery_rounds:read`, le droit qui ouvre l'écran des tournées : le
 * `POST` n'écrit rien, d'où {@link RequirePermission} plutôt que le `write`
 * que le verbe impliquerait. La réponse du sondage n'est jamais mise en cache
 * partagé : le middleware de l'API pose `private, no-store`.
 */
@Controller("admin/delivery/road-routing")
@AdminSurface("delivery_rounds")
export class RoadRoutingWakeController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post("wake")
  @Idempotent(
    "réveille le moteur d'itinéraires sans rien écrire ; rejoué dans l'intervalle, le réveil ne repart même pas",
  )
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission("delivery_rounds:read")
  async wake(): Promise<void> {
    await this.commands.execute<WakeRoadRoutingCommand, void>(new WakeRoadRoutingCommand());
  }

  @Get("readiness")
  @RequirePermission("delivery_rounds:read")
  readiness(): Promise<RoadRoutingReadinessView> {
    return this.queries.execute<GetRoadRoutingReadinessQuery, RoadRoutingReadinessView>(
      new GetRoadRoutingReadinessQuery(),
    );
  }
}
