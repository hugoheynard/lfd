import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { BinDesk } from "../../channels/delivery/index.js";
import { ContainerBinGoneError } from "../../domain/errors/packing-container-errors.js";
import {
  citeContainer,
  PackingContainerMovedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { citedOrderOf, lockedSheet, movementIntent } from "./container-support.js";
import { MoveBetweenContainersCommand } from "./move-between-containers.command.js";

/**
 * **Déplace des pièces d'une ligne d'un contenant à un autre** de la même
 * commande, en UN geste : retirer puis glisser en deux appels laisserait, sur
 * une coupure, les pièces hors de tout contenant.
 *
 * Seul le bac de la commande est verrouillé : la réserve n'est ni lue ni
 * écrite — les pièces restent au bac, et le total réparti de la ligne ne
 * change pas. Comme pour « glisser », un contenant d'arrivée `bin` dont le bac
 * n'est plus vivant chez la livraison est refusé.
 *
 * Au journal : les deux faits existants, `emptied` à la source puis `filled`
 * à l'arrivée — un lecteur du contenu de chaque contenant reste juste.
 *
 * **Une fois par intention** : la clé de l'écran est scellée dans la même
 * unité de travail que le mouvement ; un rejeu de la même clé ne refait rien
 * et rend le même résultat (rien — la route rend 204), un échec rend
 * l'intention et l'écran peut réessayer.
 *
 * @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {PackingContainerNotFoundError}
 * @throws {PackingContainerVoidedError} @throws {ContainerBinGoneError}
 * @throws {PackingLineNotFoundError} @throws {MoveToSameContainerError}
 * @throws {InvalidContainerQuantityError} @throws {WithdrawBeyondContentError}
 */
@CommandHandler(MoveBetweenContainersCommand)
export class MoveBetweenContainersHandler implements ICommandHandler<
  MoveBetweenContainersCommand,
  void
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly desk: BinDesk,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: MoveBetweenContainersCommand): Promise<void> {
    return this.intents.runSealed(
      movementIntent("packing.transfer", command, command.fromContainerId),
      NOTHING_TO_REPLAY,
      (seal) => this.move(command, seal),
    );
  }

  private async move(
    command: MoveBetweenContainersCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    await this.uow.run(async () => {
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      const line = sheet.lineToTouch(command.sku);
      const pieces = sheet.move(
        command.fromContainerId,
        command.toContainerId,
        command.sku,
        command.quantity,
      );
      const target = sheet.liveContainer(command.toContainerId);
      // Verrouillé jusqu'au COMMIT : une annulation ne se glisse plus entre
      // la question et l'écriture (audit final du réassort, 2026-11-03).
      if (target.bin !== null && !(await this.desk.holdLiveBin(target.bin.binId))) {
        throw new ContainerBinGoneError(target.bin.code);
      }
      await this.sheets.save(sheet);
      const order = citedOrderOf(sheet);
      for (const [direction, containerId] of [
        ["emptied", command.fromContainerId],
        ["filled", command.toContainerId],
      ] as const) {
        await this.events.publishTraced(
          new PackingContainerMovedEvent(
            direction,
            order,
            citeContainer(sheet.containerList, containerId),
            line,
            pieces,
          ),
        );
      }
      await seal(undefined);
    });
  }
}
