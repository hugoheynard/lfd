import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OperationRepository } from "../../domain/ports/operation.repository.js";
import { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import { RefocusOperationImageCommand } from "./refocus-operation-image.command.js";

/**
 * **Le point focal suit jusqu'à l'opération** — comme
 * `RefocusStorefrontImageHandler` pour la vitrine (`mediatheque.md` §7 bis) :
 * charger les opérations qui montrent l'image, recadrer par l'agrégat, sauver.
 *
 * Rend le nombre d'opérations recadrées ; à zéro, rien n'est écrit.
 *
 * 🔴 **Interrupteur fermé, il ne fait RIEN et rend 0** — sans lever : il est
 * appelé par un abonné durable, et un refus y serait rejoué sans fin. Fermé,
 * c'est le fait `pim.operation_image_changed` qui porte le point jusqu'à ces
 * lignes ; un second écrivain dirait au commerce ce que le référentiel n'a
 * pas annoncé.
 *
 * @sans-journal conséquence d'un geste déjà journalisé à la médiathèque (`media_asset.described`).
 */
@CommandHandler(RefocusOperationImageCommand)
export class RefocusOperationImageHandler implements ICommandHandler<
  RefocusOperationImageCommand,
  number
> {
  constructor(
    private readonly operations: OperationRepository,
    private readonly writing: OperationWritingSwitch,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws {InvalidOperationFocalError} point focal hors de l'image. */
  async execute(command: RefocusOperationImageCommand): Promise<number> {
    if (!this.writing.isOpen()) {
      return 0;
    }
    return this.uow.run(async () => {
      const showing = await this.operations.loadShowingImage(command.url);
      let refocused = 0;
      // Une archivée garde son point : elle suit un remplacement, pas un recadrage.
      for (const operation of showing.filter((candidate) => !candidate.isArchived)) {
        if (operation.refocusImage(command.url, command.focal)) {
          await this.operations.save(operation);
          refocused += 1;
        }
      }
      return refocused;
    });
  }
}
