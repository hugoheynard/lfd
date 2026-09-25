import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { requireOperation } from "./operation-support.js";

export class ChangeOperationAudienceCommand {
  constructor(
    readonly key: string,
    readonly audience: string,
  ) {}
}

/**
 * **Change la clientèle** d'une opération (D7) : professionnels, particuliers,
 * ou les deux. Décidé ici, au référentiel ; la réception du commerce pourra
 * restreindre, jamais élargir (lot 2).
 */
@CommandHandler(ChangeOperationAudienceCommand)
export class ChangeOperationAudienceHandler implements ICommandHandler<
  ChangeOperationAudienceCommand,
  void
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ChangeOperationAudienceCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    const from = operation.snapshot().audience;
    operation.changeAudience(command.audience);
    const after = operation.snapshot();
    if (after.audience === from) {
      return;
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.operationAudienceChanged,
        subjectType: "operation",
        subjectId: after.key,
        payload: { subjectLabel: after.name.fr, audience: { from, to: after.audience } },
      });
      await this.operations.save(operation, ticket);
    });
  }
}
