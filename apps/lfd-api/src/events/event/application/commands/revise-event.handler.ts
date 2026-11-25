import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { EventNotFoundError } from "../../domain/errors/event-errors.js";
import { EventRepository } from "../../domain/ports/event.repository.js";
import { EventDate } from "../../domain/value-objects/event-date.js";
import { EventName } from "../../domain/value-objects/event-name.js";
import { ReviseEventCommand } from "./revise-event.command.js";

/**
 * **Renommer ou déplacer un événement.** Les deux valeurs sont validées avant
 * toute écriture : un nom refusé ne laisse pas passer la date seule.
 *
 * @sans-journal le bloc des événements n'a pas de journal : un événement ne
 * porte ni argent ni accès, et sa date se relit sur la ligne.
 */
@CommandHandler(ReviseEventCommand)
export class ReviseEventHandler implements ICommandHandler<ReviseEventCommand, void> {
  constructor(
    private readonly events: EventRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReviseEventCommand): Promise<void> {
    const name = command.name === null ? null : EventName.of(command.name);
    const date = command.date === null ? null : EventDate.fromString(command.date);
    const at = this.clock.now();
    await this.uow.run(async () => {
      const event = await this.events.load(command.eventId);
      if (event === null) {
        throw new EventNotFoundError(command.eventId);
      }
      if (name !== null) {
        event.rename(name, at);
      }
      if (date !== null) {
        event.reschedule(date, at);
      }
      await this.events.save(event);
    });
  }
}
