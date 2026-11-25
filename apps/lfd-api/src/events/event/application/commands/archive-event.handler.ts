import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { EventNotFoundError } from "../../domain/errors/event-errors.js";
import { EventRepository } from "../../domain/ports/event.repository.js";
import { ArchiveEventCommand } from "./archive-event.command.js";

/**
 * **Archiver un événement.** Rien n'est effacé : l'événement et ses fiches
 * restent en base, hors de la table. Rejoué, l'archivage garde son premier
 * instant.
 *
 * @sans-journal le bloc des événements n'a pas de journal : un événement ne
 * porte ni argent ni accès, et l'instant d'archivage se relit sur la ligne.
 */
@CommandHandler(ArchiveEventCommand)
export class ArchiveEventHandler implements ICommandHandler<ArchiveEventCommand, void> {
  constructor(
    private readonly events: EventRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveEventCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      const event = await this.events.load(command.eventId);
      if (event === null) {
        throw new EventNotFoundError(command.eventId);
      }
      event.archive(at);
      await this.events.save(event);
    });
  }
}
