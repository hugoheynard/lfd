import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { RescheduleOperationPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { requireOperation, scheduleInputOf, scheduleText } from "./operation-support.js";

export class RescheduleOperationCommand {
  constructor(
    readonly key: string,
    readonly payload: RescheduleOperationPayload,
  ) {}
}

/**
 * **Redate** une opération : les cinq dates ensemble, parce que leur ordre ne
 * se juge qu'à cinq (D2).
 *
 * Le fait ne porte que les dates qui ont bougé, avant → après : c'est lui qui
 * répondra à « qui a avancé la clôture de Noël ». Redater au référentiel ne
 * change la boutique qu'une fois l'envoi accepté (D1) — ce n'est pas l'affaire
 * de ce cas d'usage.
 */
@CommandHandler(RescheduleOperationCommand)
export class RescheduleOperationHandler implements ICommandHandler<
  RescheduleOperationCommand,
  void
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RescheduleOperationCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    const before = scheduleText(operation.snapshot().schedule);
    operation.reschedule(scheduleInputOf(command.payload));
    const after = operation.snapshot();
    const changes = changesBetween(before, scheduleText(after.schedule));
    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.operationRescheduled,
        subjectType: "operation",
        subjectId: after.key,
        payload: { subjectLabel: after.name.fr, changes },
      });
      await this.operations.save(operation, ticket);
    });
  }
}
