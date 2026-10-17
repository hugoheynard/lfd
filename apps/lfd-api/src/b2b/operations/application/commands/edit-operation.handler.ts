import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import type { OperationSnapshot } from "../../domain/entities/operation.js";
import { OperationEditedEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { EditOperationCommand } from "./edit-operation.command.js";
import { imageFromLibrary, journalImage } from "./operation-image-choice.js";
import { requireOperation, subjectOf } from "./operation-writing.js";

/**
 * **Réécrit ce que l'annonce affiche.** La clé n'en fait pas partie — elle ne
 * change jamais.
 *
 * Rien de changé, rien d'écrit : un enregistrement sans effet ne remplit pas
 * l'historique d'une ligne vide, et ne change pas l'auteur de la dernière
 * écriture.
 *
 * L'image est choisie dans la médiathèque (lot 2) : une adresse NOUVELLE y
 * est décrite — inconnue, 404 —, et son point focal vient avec elle.
 */
@CommandHandler(EditOperationCommand)
export class EditOperationHandler implements ICommandHandler<EditOperationCommand, void> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly library: OperationImageLibrary,
  ) {}

  async execute(command: EditOperationCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    const current = operation.snapshot();
    const image = await imageFromLibrary(this.library, command.presentation.image, current.image);
    const before = presentation(current);
    operation.edit(
      { ...command.presentation, image },
      { by: command.writtenBy, at: this.clock.now() },
    );
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

/** Ce que le journal compare : le point focal n'y entre pas (`journalImage`). */
function presentation(snapshot: OperationSnapshot) {
  return { name: snapshot.name, lede: snapshot.lede, image: journalImage(snapshot.image) };
}
