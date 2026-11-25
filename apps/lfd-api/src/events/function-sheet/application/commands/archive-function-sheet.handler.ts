import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { EventNotFoundError } from "../../../event/domain/errors/event-errors.js";
import { EventRepository } from "../../../event/domain/ports/event.repository.js";
import { ArchiveFunctionSheetCommand } from "./archive-function-sheet.command.js";

/**
 * **Retirer une fiche** : elle sort du détail et du dossier du jour, sa ligne
 * et son objet au stockage restent. Rejoué, le geste ne change rien.
 *
 * @sans-journal le bloc des événements n'a pas de journal : l'heure du
 * retrait est gardée sur la fiche (`archived_at`).
 */
@CommandHandler(ArchiveFunctionSheetCommand)
export class ArchiveFunctionSheetHandler implements ICommandHandler<
  ArchiveFunctionSheetCommand,
  void
> {
  constructor(
    private readonly events: EventRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveFunctionSheetCommand): Promise<void> {
    await this.uow.run(async () => {
      const event = await this.events.load(command.eventId);
      if (event === null) {
        throw new EventNotFoundError(command.eventId);
      }
      event.archiveSheet(command.sheetId, this.clock.now());
      await this.events.save(event);
    });
  }
}
