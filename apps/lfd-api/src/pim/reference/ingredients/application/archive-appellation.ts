import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { AppellationNotFoundError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";

export class ArchiveAppellationCommand {
  constructor(readonly code: string) {}
}

/**
 * Archive une appellation : elle ne se pose plus sur un ingrédient. Toujours
 * permis — les ingrédients qui la portent la gardent. On ne supprime plus une
 * appellation (décision de Hugo du 2026-11-18). Rejoué sur une appellation
 * archivée : ni écriture, ni fait.
 *
 * Chargé dans la transaction, et seul `archived_at` est écrit : une mise à
 * jour concurrente n'est pas effacée.
 */
@CommandHandler(ArchiveAppellationCommand)
export class ArchiveAppellationHandler implements ICommandHandler<ArchiveAppellationCommand, void> {
  constructor(
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveAppellationCommand): Promise<void> {
    const { code } = command;
    await this.uow.run(async () => {
      const found = await this.appellations.findByCode(code);
      if (found === null) {
        throw new AppellationNotFoundError(code);
      }
      if (!found.archive(this.clock.now())) {
        return;
      }
      const { label } = found.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.appellationArchived,
        subjectType: "appellation",
        subjectId: code,
        payload: { subjectLabel: label.fr, label },
      });
      await this.appellations.saveArchival(found, ticket);
    });
  }
}
