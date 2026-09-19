import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { UpdateAppellationPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import type { AppellationSnapshot } from "../domain/entities/appellation.entity.js";
import { AppellationNotFoundError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";

export class UpdateAppellationCommand {
  constructor(
    readonly code: string,
    readonly payload: UpdateAppellationPayload,
  ) {}
}

/** Règle une appellation — tout sauf son code. */
@CommandHandler(UpdateAppellationCommand)
export class UpdateAppellationHandler implements ICommandHandler<UpdateAppellationCommand, void> {
  constructor(
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateAppellationCommand): Promise<void> {
    const { code, payload } = command;
    const appellation = await this.appellations.findByCode(code);
    if (appellation === null) {
      throw new AppellationNotFoundError(code);
    }
    const before = traced(appellation.snapshot());
    appellation.revise(payload);
    const changes = changesBetween(before, traced(appellation.snapshot()));

    await this.uow.run(async () => {
      // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
      // filtre, l'historique serait surtout fait de gestes sans effet.
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.appellationUpdated,
              subjectType: "appellation",
              subjectId: code,
              payload: { changes },
            })
          : this.journal.untraced("record without modification");
      await this.appellations.save(appellation, ticket);
    });
  }
}

/** Ce que le journal retient. Le code n'y est pas : il EST le sujet du fait. */
function traced(snapshot: AppellationSnapshot): Record<string, unknown> {
  const { label, scheme, active } = snapshot;
  return { label, scheme, active };
}
