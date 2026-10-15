import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationRescheduledEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import {
  ensureWritingOpen,
  requireOperation,
  scheduleText,
  subjectOf,
} from "./operation-writing.js";
import { RescheduleOperationCommand } from "./reschedule-operation.command.js";

/**
 * **Redate** une opération. L'agrégat refuse des dates qui se contredisent
 * (D2) ; le journal ne garde que celles qui ont bougé.
 *
 * « Fermer plus tôt », que la surcharge de la réception portait, est ce geste
 * au commerce : il n'y a plus qu'un décideur (plan, « Ce que devient chaque
 * champ de la surcharge »).
 */
@CommandHandler(RescheduleOperationCommand)
export class RescheduleOperationHandler implements ICommandHandler<
  RescheduleOperationCommand,
  void
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly writing: OperationWritingSwitch,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RescheduleOperationCommand): Promise<void> {
    ensureWritingOpen(this.writing);
    const operation = await requireOperation(this.operations, command.key);
    const before = scheduleText(operation.snapshot().schedule);
    operation.reschedule(command.schedule, { by: command.writtenBy, at: this.clock.now() });
    const after = operation.snapshot();
    const changes = changesBetween(before, scheduleText(after.schedule));
    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.uow.run(async () => {
      await this.operations.save(operation);
      await this.events.publishTraced(new OperationRescheduledEvent(subjectOf(after), changes));
    });
  }
}
