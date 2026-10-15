import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OperationImageLibrary } from "../../channels/media/operation-image-library.js";
import { Operation } from "../../domain/entities/operation.js";
import { OperationKeyTakenError } from "../../domain/errors/operation-errors.js";
import { OperationPreparedEvent } from "../../domain/events/operation.events.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import { imageFromLibrary, journalImage } from "./operation-image-choice.js";
import { ensureWritingOpen, scheduleText, subjectOf } from "./operation-writing.js";
import { PrepareOperationCommand } from "./prepare-operation.command.js";

/**
 * **Prépare** une opération au commerce.
 *
 * L'agrégat naît AVANT la recherche de collision : c'est lui qui nettoie la
 * clé, et c'est la version nettoyée qu'il faut confronter aux autres.
 *
 * 🔴 Une clé déjà prise est refusée **archivée ou retirée comprise** (D9) —
 * une opération reçue du référentiel aussi : elles partagent la table. La
 * lecture donne le message ; la clé primaire tient la course entre deux
 * onglets — `add` crée, il n'écrase pas.
 *
 * L'image, s'il y en a une, est une image de la médiathèque (lot 2) — 404
 * sinon —, et arrive avec son point focal.
 *
 * Rend la clé : c'est l'identité, choisie par le staff et non par la base.
 */
@CommandHandler(PrepareOperationCommand)
export class PrepareOperationHandler implements ICommandHandler<PrepareOperationCommand, string> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly writing: OperationWritingSwitch,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly library: OperationImageLibrary,
  ) {}

  async execute(command: PrepareOperationCommand): Promise<string> {
    ensureWritingOpen(this.writing);
    const image = await imageFromLibrary(this.library, command.operation.image, null);
    const operation = Operation.prepare(
      { ...command.operation, image },
      {
        by: command.writtenBy,
        at: this.clock.now(),
      },
    );
    const prepared = operation.snapshot();
    if ((await this.operations.load(prepared.key)) !== null) {
      throw new OperationKeyTakenError(prepared.key);
    }

    await this.uow.run(async () => {
      await this.operations.add(operation);
      await this.events.publishTraced(
        new OperationPreparedEvent(subjectOf(prepared), {
          name: prepared.name,
          lede: prepared.lede,
          image: journalImage(prepared.image),
          audience: prepared.audience,
          ...scheduleText(prepared.schedule),
        }),
      );
    });
    return prepared.key;
  }
}
