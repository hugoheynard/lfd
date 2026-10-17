import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationArchivedEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { ArchiveOperationCommand } from "./archive-operation.command.js";
import { requireOperation, subjectOf } from "./operation-writing.js";

/**
 * **Archive** une opération. Jamais de suppression : la clé reste prise pour
 * toujours (D9), et l'instant du geste devient sa date de retrait
 * (`withdrawn_at`, qui garde son sens — plan, « Corrections après vitruve »).
 */
@CommandHandler(ArchiveOperationCommand)
export class ArchiveOperationHandler implements ICommandHandler<ArchiveOperationCommand, void> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveOperationCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    operation.archive({ by: command.writtenBy, at: this.clock.now() });
    const archived = operation.snapshot();

    await this.uow.run(async () => {
      await this.operations.save(operation);
      await this.events.publishTraced(new OperationArchivedEvent(subjectOf(archived)));
    });
  }
}
