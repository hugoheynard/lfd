import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { PrepareOperationPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { ImageCatalogue } from "../../channels/media/image-catalogue.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { Operation } from "../domain/entities/operation.js";
import { OperationKeyTakenError } from "../domain/errors/operation-errors.js";
import { OperationRepository } from "../domain/ports/operation.repository.js";
import { ensureImageKnown, scheduleInputOf, scheduleText } from "./operation-support.js";

export class PrepareOperationCommand {
  constructor(readonly payload: PrepareOperationPayload) {}
}

/**
 * **Prépare** une opération : sa clé, son nom, ses dates, sa clientèle. La
 * sélection commence vide — on la compose ensuite.
 *
 * L'agrégat naît AVANT la recherche de collision : c'est lui qui nettoie la
 * clé, et c'est la version nettoyée qu'il faut confronter aux autres.
 *
 * 🔴 Une clé déjà prise est refusée **archivée comprise** (D9). La lecture
 * ci-dessous donne le message ; la clé primaire, elle, tient la course entre
 * deux onglets — `add` crée, il n'écrase pas.
 *
 * Rend la clé : c'est l'identité, choisie par le staff et non par la base.
 */
@CommandHandler(PrepareOperationCommand)
export class PrepareOperationHandler implements ICommandHandler<PrepareOperationCommand, string> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly images: ImageCatalogue,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PrepareOperationCommand): Promise<string> {
    const { payload } = command;
    const operation = Operation.prepare({
      key: payload.key,
      name: payload.name,
      lede: payload.lede,
      image: payload.image,
      schedule: scheduleInputOf(payload),
      audience: payload.audience,
    });
    const prepared = operation.snapshot();
    await ensureImageKnown(this.images, prepared.image);
    if ((await this.operations.load(prepared.key)) !== null) {
      throw new OperationKeyTakenError(prepared.key);
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.operationPrepared,
        subjectType: "operation",
        subjectId: prepared.key,
        payload: {
          subjectLabel: prepared.name.fr,
          name: prepared.name,
          lede: prepared.lede,
          image: prepared.image,
          audience: prepared.audience,
          ...scheduleText(prepared.schedule),
        },
      });
      await this.operations.add(operation, ticket);
    });
    return prepared.key;
  }
}
