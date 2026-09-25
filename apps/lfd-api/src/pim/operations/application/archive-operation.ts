import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { requireOperation } from "./operation-support.js";

export class ArchiveOperationCommand {
  constructor(readonly key: string) {}
}

/**
 * **Archive** une opération. Jamais de suppression : la clé reste prise pour
 * toujours, et le commerce, qui y accrochera ses surcharges, ne verra jamais
 * une autre opération renaître dessous (D9).
 */
@CommandHandler(ArchiveOperationCommand)
export class ArchiveOperationHandler implements ICommandHandler<ArchiveOperationCommand, void> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveOperationCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    operation.archive(this.clock.now());
    const archived = operation.snapshot();

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.operationArchived,
        subjectType: "operation",
        subjectId: archived.key,
        payload: { subjectLabel: archived.name.fr },
      });
      await this.operations.save(operation, ticket);
    });
  }
}
