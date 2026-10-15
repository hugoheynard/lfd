import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { OperationSnapshot } from "../../domain/entities/operation.js";
import { OperationEditedEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import { EditOperationCommand } from "./edit-operation.command.js";
import { ensureWritingOpen, requireOperation, subjectOf } from "./operation-writing.js";

/**
 * **Réécrit ce que l'annonce affiche.** La clé n'en fait pas partie — elle ne
 * change jamais.
 *
 * Rien de changé, rien d'écrit : un enregistrement sans effet ne remplit pas
 * l'historique d'une ligne vide, et ne change pas l'auteur de la dernière
 * écriture.
 */
@CommandHandler(EditOperationCommand)
export class EditOperationHandler implements ICommandHandler<EditOperationCommand, void> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly writing: OperationWritingSwitch,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: EditOperationCommand): Promise<void> {
    ensureWritingOpen(this.writing);
    const operation = await requireOperation(this.operations, command.key);
    const before = presentation(operation.snapshot());
    operation.edit(command.presentation, { by: command.writtenBy, at: this.clock.now() });
    const after = operation.snapshot();
    const changes = changesBetween(before, presentation(after));
    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.uow.run(async () => {
      await this.operations.save(operation);
      await this.events.publishTraced(new OperationEditedEvent(subjectOf(after), changes));
    });
  }
}

function presentation(
  snapshot: OperationSnapshot,
): Pick<OperationSnapshot, "name" | "lede" | "image"> {
  return { name: snapshot.name, lede: snapshot.lede, image: snapshot.image };
}
