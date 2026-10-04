import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { OrderReferenceNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderHandedOverEvent } from "../../domain/events/order-handed-over.event.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { MarkOrderFulfilledCommand } from "./mark-order-fulfilled.command.js";

/**
 * **Le commerce tire son statut de la remise constatée au fournil.**
 *
 * ## Ce qu'il fait, et ce qu'il ne juge pas
 *
 * Il recopie et publie. Il ne rejoue **aucune** règle de remise : elle a été
 * appliquée par l'agrégat du fournil, devant le client. La rejouer ici ferait
 * exactement le mal qu'on veut éviter — un commerce qui refuse d'enregistrer une
 * remise qui a physiquement eu lieu, et un colis parti que rien n'atteste.
 *
 * Le seul refus qui reste est structurel : la commande n'existe pas sous ce
 * numéro. Ce n'est pas un cas métier, c'est une incohérence entre deux
 * contextes, et elle doit lever.
 *
 * ## Pourquoi il écrit son propre fait
 *
 * `order.fulfilled` est écouté par les points et par le journal. Le retrait
 * écrit **le sien** (`handover.handed_over`), dans son canal ; brancher ces
 * deux abonnés dessus leur aurait donné une connaissance du retrait, pour zéro
 * gain. Un fait traverse la frontière une fois, à un seul endroit.
 *
 * ## Idempotent, et durable (lot E2, 2026-10-04)
 *
 * `markFulfilled` et `order.fulfilled` partent dans UNE unité de travail —
 * celle de la livraison durable quand l'abonné du retrait l'appelle, la sienne
 * sinon. Une écriture perdue (`won === false`) n'est PAS une erreur : le fait
 * a été rejoué ou réannoncé, ou la commande portait déjà son attestation. On
 * n'écrit alors rien — ni second gain de points, ni second témoin au journal.
 * Ce handler ne publie plus rien en mémoire : plus rien n'hérite de la
 * transaction du relais.
 */
@CommandHandler(MarkOrderFulfilledCommand)
export class MarkOrderFulfilledHandler implements ICommandHandler<MarkOrderFulfilledCommand, void> {
  constructor(
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
  ) {}

  async execute(command: MarkOrderFulfilledCommand): Promise<void> {
    const order = await this.orders.findAuthorByReference(command.reference);
    if (order === null) {
      throw new OrderReferenceNotFoundError(command.reference);
    }

    const fulfilled = new OrderHandedOverEvent(
      order.orderId,
      order.orderNumber,
      order.placedByUserId,
      command.staffUserId,
      command.at,
      command.via,
    );
    await this.uow.run(async () => {
      const won = await this.repository.markFulfilled(
        command.reference,
        command.at,
        command.staffUserId,
        command.via,
      );
      if (won) {
        await this.durable.publish(fulfilled.durableFact());
      }
    });
  }
}
