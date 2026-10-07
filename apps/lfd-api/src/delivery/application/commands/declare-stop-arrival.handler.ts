import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DoorstepStopNotFoundError } from "../../domain/errors/delivery-doorstep-errors.js";
import { DeliveryStopArrivedEvent } from "../../domain/events/delivery-doorstep.events.js";
import { DoorstepStopRepository } from "../../domain/ports/doorstep-stop.repository.js";
import { gesturePositionOf } from "../doorstep-support.js";
import { DeclareStopArrivalCommand } from "./declare-stop-arrival.command.js";

/**
 * **« Je suis arrivé »** (`documentation/livraisons/livreur/a-la-porte.md`,
 * AP-D6) — l'instant du `Clock`, écrit dans l'exécution de l'arrêt, jamais
 * dans la tournée : `closeStop` et sa version n'ont rien à voir ici.
 *
 * L'arrêt est chargé SOUS LE MUR du livreur ; une tournée d'un autre, ou un
 * arrêt qui n'en est pas, est un 404 qui ne confirme rien. Une seconde
 * arrivée ne réécrit rien et ne journalise rien : la route rend 204 quand
 * même — le livreur qui rejoue après une perte de réseau n'a rien à corriger.
 * La position du téléphone, quand l'écran l'envoie, s'écrit avec l'arrivée
 * (YA-D4).
 *
 * @throws {DoorstepStopNotFoundError} @throws {DoorstepRoundNotDepartedError}
 * @throws {DoorstepStopClosedError} @throws {GesturePositionInvalidError}
 */
@CommandHandler(DeclareStopArrivalCommand)
export class DeclareStopArrivalHandler implements ICommandHandler<DeclareStopArrivalCommand, void> {
  constructor(
    private readonly stops: DoorstepStopRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareStopArrivalCommand): Promise<void> {
    const position = gesturePositionOf(command.position);
    await this.uow.run(async () => {
      const stop = await this.stops.loadForDriver(
        command.roundId,
        command.stopId,
        command.staffUserId,
      );
      if (stop === null) {
        throw new DoorstepStopNotFoundError();
      }
      if (!stop.arrive(this.clock.now(), position)) {
        return;
      }
      await this.stops.save(stop);
      await this.events.publishTraced(new DeliveryStopArrivedEvent(stop));
    });
  }
}
