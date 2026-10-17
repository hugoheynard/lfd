import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationAudienceChangedEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { ChangeOperationAudienceCommand } from "./change-operation-audience.command.js";
import { requireOperation, subjectOf } from "./operation-writing.js";

/**
 * **Change la clientèle** d'une opération (D7). Élargir est permis : il n'y a
 * plus qu'un décideur, et l'invariant « la réception ne peut que restreindre »
 * disparaît avec la surcharge — voulu (plan, « Ce que devient chaque champ »).
 */
@CommandHandler(ChangeOperationAudienceCommand)
export class ChangeOperationAudienceHandler implements ICommandHandler<
  ChangeOperationAudienceCommand,
  void
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ChangeOperationAudienceCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    const from = operation.snapshot().audience;
    operation.changeAudience(command.audience, { by: command.writtenBy, at: this.clock.now() });
    const after = operation.snapshot();
    if (after.audience === from) {
      return;
    }

    await this.uow.run(async () => {
      await this.operations.save(operation);
      await this.events.publishTraced(
        new OperationAudienceChangedEvent(subjectOf(after), from, after.audience),
      );
    });
  }
}
