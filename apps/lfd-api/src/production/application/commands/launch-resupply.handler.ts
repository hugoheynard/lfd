import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { ProductionResupplyLaunchedJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ResupplyLaunchGestures } from "../services/resupply-launch-gesture.js";
import { ResupplyLaunchReading } from "../services/resupply-launch-reading.js";
import { ResupplyLaunchRecording } from "../services/resupply-launch-recording.js";
import { LaunchResupplyCommand } from "./launch-resupply.command.js";

/**
 * **« Lancer » un réassort « au plus tôt »** (`reassort-boutiques/au-plus-tot.md`).
 *
 * ## Sous le verrou de la journée
 *
 * Il verrouille la journée, PUIS lit sous lui ({@link ResupplyLaunchReading} :
 * la journée rechargée, le réassort au commerce, ce que l'arrêt figerait
 * encore), demande à l'agrégat de lancer, écrit et annonce
 * ({@link ResupplyLaunchRecording}), puis journalise — dans une unité de
 * travail. L'annulation
 * d'un « au plus tôt » prend le même verrou (`LaunchedResupplies`) : un
 * réassort annulé avant n'est plus rendu par le commerce, et un réassort
 * lancé avant ne s'annule plus. Lire le commerce SOUS le verrou est la même
 * exception que `placedFor` à l'arrêt, pour la même raison.
 *
 * Le geste — qui lance, et quand — est lu AVANT le verrou
 * ({@link ResupplyLaunchGestures}) : une lecture d'annuaire n'a pas à le tenir.
 */
@CommandHandler(LaunchResupplyCommand)
export class LaunchResupplyHandler implements ICommandHandler<LaunchResupplyCommand, void> {
  constructor(
    private readonly lock: ProductionDayLock,
    private readonly uow: UnitOfWork,
    private readonly gestures: ResupplyLaunchGestures,
    private readonly reading: ResupplyLaunchReading,
    private readonly recording: ResupplyLaunchRecording,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: LaunchResupplyCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const gesture = await this.gestures.of(command.staffUserId);
    await this.uow.run(async () => {
      await this.lock.lock(day);
      const { current, resupply, pending } = await this.reading.underLock(day, command.resupplyId);
      // Les coches héritées sont matérialisées AVANT : le compte se refait, et
      // une coche de l'ancien poste y serait perdue (§5.3 des fournées).
      const inherited = current.materialize();
      const openedPlan = current.launchResupply(resupply, gesture, pending);
      await this.recording.record({ day, current, resupply, gesture, inherited, openedPlan });
      await this.events.publishTraced(
        new ProductionResupplyLaunchedJournalEvent(day.value, resupply, openedPlan),
      );
    });
  }
}
