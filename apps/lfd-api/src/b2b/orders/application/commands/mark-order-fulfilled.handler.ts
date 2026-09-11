import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
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
 * ## Pourquoi il republie
 *
 * `OrderHandedOverEvent` (celui du commerce) est déjà écouté par le journal
 * d'activité. Le fournil publie **le sien**, dans son canal ; le rebrancher
 * directement sur `growth` aurait donné à un second bloc du commerce une
 * connaissance de la production, pour zéro gain. Un fait traverse la frontière
 * une fois, à un seul endroit.
 *
 * ⚠️ Une écriture perdue (`won === false`) n'est PAS une erreur : l'abonné a été
 * rappelé, ou la commande portait déjà son attestation. On ne republie alors
 * rien — sinon le journal compterait deux remises là où il n'y en a eu qu'une.
 */
@CommandHandler(MarkOrderFulfilledCommand)
export class MarkOrderFulfilledHandler implements ICommandHandler<MarkOrderFulfilledCommand, void> {
  constructor(
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: MarkOrderFulfilledCommand): Promise<void> {
    const order = await this.orders.findAuthorByReference(command.reference);
    if (order === null) {
      throw new OrderReferenceNotFoundError(command.reference);
    }

    const won = await this.repository.markFulfilled(
      command.reference,
      command.at,
      command.staffSubject,
      command.via,
    );
    if (!won) {
      return;
    }

    this.events.publish(
      new OrderHandedOverEvent(
        order.orderId,
        order.orderNumber,
        order.placedByUserId,
        command.staffSubject,
        command.at,
        command.via,
      ),
    );
  }
}
