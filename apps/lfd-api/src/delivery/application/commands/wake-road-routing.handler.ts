import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../platform/events/background-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { RoadRoutingWaker } from "../../domain/ports/road-routing-waker.js";
import { WakeRoadRoutingCommand } from "./wake-road-routing.command.js";

/**
 * Pas plus d'un réveil par minute : une ouverture répétée du Tour manager
 * (rechargement, deux postes) ne martèle pas le conteneur, et un réveil en
 * cours attend déjà la carte (`OSRM_WAKE_BUDGET_MS`).
 */
export const WAKE_INTERVAL_MS = 60_000;

/**
 * **Réveiller le calcul routier** (2026-11-01, décision de Hugo) : l'appel
 * part en tâche de fond (`BackgroundWork.detach`) et la commande rend la main
 * tout de suite — la route répond 202 sans attendre le chargement de la carte.
 *
 * Le dernier réveil est retenu dans le processus (le handler est un
 * singleton) : un processus redémarré réveille une fois de plus, sans dommage.
 *
 * @sans-journal un réveil n'écrit rien et ne décide rien ; son échec se lit au journal technique.
 */
@CommandHandler(WakeRoadRoutingCommand)
export class WakeRoadRoutingHandler implements ICommandHandler<WakeRoadRoutingCommand, void> {
  private lastWakeAt: number | null = null;

  constructor(
    private readonly waker: RoadRoutingWaker,
    private readonly clock: Clock,
    private readonly background: BackgroundWork,
  ) {}

  execute(_command: WakeRoadRoutingCommand): Promise<void> {
    const now = this.clock.now().getTime();
    if (this.lastWakeAt !== null && now - this.lastWakeAt < WAKE_INTERVAL_MS) {
      return Promise.resolve();
    }
    this.lastWakeAt = now;
    void this.background.detach(() => this.waker.wake(), "delivery.road_routing_wake");
    return Promise.resolve();
  }
}
