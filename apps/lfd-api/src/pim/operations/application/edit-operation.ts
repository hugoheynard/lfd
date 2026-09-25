import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { EditOperationPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../platform/journal/changes.js";
import { ImageCatalogue } from "../../channels/media/image-catalogue.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import type { OperationSnapshot } from "../domain/entities/operation.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { ensureImageKnown, requireOperation } from "./operation-support.js";

export class EditOperationCommand {
  constructor(
    readonly key: string,
    readonly payload: EditOperationPayload,
  ) {}
}

/**
 * **Réécrit ce que l'annonce affiche** : le nom, l'accroche, l'image. La clé
 * n'en fait pas partie — elle ne change jamais.
 *
 * Rien de changé, rien d'écrit : un enregistrement sans effet ne remplit pas
 * l'historique d'une ligne vide.
 */
@CommandHandler(EditOperationCommand)
export class EditOperationHandler implements ICommandHandler<EditOperationCommand, void> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly images: ImageCatalogue,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: EditOperationCommand): Promise<void> {
    const operation = await requireOperation(this.operations, command.key);
    const before = presentation(operation.snapshot());
    operation.edit(command.payload);
    const after = operation.snapshot();
    const changes = changesBetween(before, presentation(after));
    if (Object.keys(changes).length === 0) {
      return;
    }
    // Seulement si l'image a bougé : une image retirée de la bibliothèque
    // depuis ne doit pas empêcher de corriger une faute dans le nom.
    if (changes["image"] !== undefined) {
      await ensureImageKnown(this.images, after.image);
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.operationEdited,
        subjectType: "operation",
        subjectId: after.key,
        payload: { subjectLabel: after.name.fr, changes },
      });
      await this.operations.save(operation, ticket);
    });
  }
}

function presentation(
  snapshot: OperationSnapshot,
): Pick<OperationSnapshot, "name" | "lede" | "image"> {
  return { name: snapshot.name, lede: snapshot.lede, image: snapshot.image };
}
