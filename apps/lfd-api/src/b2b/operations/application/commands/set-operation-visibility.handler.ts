import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationVisibilityChangedEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import { ensureWritingOpen, requireOperation, subjectOf } from "./operation-writing.js";
import { SetOperationVisibilityCommand } from "./set-operation-visibility.command.js";

/**
 * **Masque ou affiche** une opération — ce que `isHidden` de la surcharge
 * portait, devenu un champ de l'opération elle-même.
 *
 * ⚠️ Au lot 1, aucune lecture ne consulte encore `hidden` : la boutique lit
 * le miroir et sa surcharge comme avant. La bascule (lot 3) l'y branche.
 */
@CommandHandler(SetOperationVisibilityCommand)
export class SetOperationVisibilityHandler implements ICommandHandler<
  SetOperationVisibilityCommand,
  void
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly writing: OperationWritingSwitch,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetOperationVisibilityCommand): Promise<void> {
    ensureWritingOpen(this.writing);
    const operation = await requireOperation(this.operations, command.key);
    const stamp = { by: command.writtenBy, at: this.clock.now() };
    if (!operation.setHidden(command.hidden, stamp)) {
      return;
    }
    const after = operation.snapshot();

    await this.uow.run(async () => {
      await this.operations.save(operation);
      await this.events.publishTraced(
        new OperationVisibilityChangedEvent(subjectOf(after), after.hidden),
      );
    });
  }
}
