import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { AppellationNotFoundError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";

export class RestoreAppellationCommand {
  constructor(readonly code: string) {}
}

/**
 * Remet une appellation archivée au référentiel : elle se pose de nouveau sur
 * un ingrédient. Rejouée sur une appellation en service : ni écriture, ni fait.
 *
 * Chargé dans la transaction, et seul `archived_at` est écrit : une mise à
 * jour concurrente n'est pas effacée.
 */
@CommandHandler(RestoreAppellationCommand)
export class RestoreAppellationHandler implements ICommandHandler<RestoreAppellationCommand, void> {
  constructor(
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RestoreAppellationCommand): Promise<void> {
    const { code } = command;
    await this.uow.run(async () => {
      const found = await this.appellations.findByCode(code);
      if (found === null) {
        throw new AppellationNotFoundError(code);
      }
      if (!found.restore()) {
        return;
      }
      const { label } = found.snapshot();
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.appellationRestored,
        subjectType: "appellation",
        subjectId: code,
        payload: { subjectLabel: label.fr, label },
      });
      await this.appellations.saveArchival(found, ticket);
    });
  }
}
