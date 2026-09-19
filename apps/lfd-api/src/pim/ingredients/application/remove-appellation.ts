import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AppellationNotFoundError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";

export class RemoveAppellationCommand {
  constructor(readonly code: string) {}
}

/**
 * Efface une appellation.
 *
 * Le refus « encore citée » n'est PAS vérifié ici : la clé étrangère le tient,
 * et un compte préalable laisserait l'intervalle entre le compte et l'ordre.
 */
@CommandHandler(RemoveAppellationCommand)
export class RemoveAppellationHandler implements ICommandHandler<RemoveAppellationCommand, void> {
  constructor(
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveAppellationCommand): Promise<void> {
    const { code } = command;
    const appellation = await this.appellations.findByCode(code);
    if (appellation === null) {
      throw new AppellationNotFoundError(code);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.appellationDeleted,
        subjectType: "appellation",
        subjectId: code,
        payload: {
          subjectLabel: appellation.snapshot().label.fr,
          label: appellation.snapshot().label,
        },
      });
      await this.appellations.remove(code, ticket);
    });
  }
}
