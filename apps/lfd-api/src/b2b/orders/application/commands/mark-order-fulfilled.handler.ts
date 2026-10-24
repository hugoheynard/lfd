import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderDeliveryHistoryReader } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { receivedOnOrDayOf } from "../../../accounting/domain/services/monthly-invoicing.js";
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
 *
 * ## La date de réception, posée avec la remise (2026-10-24)
 *
 * Plan `documentation/commandes/la-commande/date-de-reception.md`, B2, option A :
 * le jour où la marchandise a changé de mains est écrit dans la MÊME
 * instruction que `handedOverAt`. La règle est celle de la facture,
 * `receivedOnOf` (comptabilité, même bloc), importée et jamais recopiée : le
 * jour de la tournée pour une remise à la porte, sinon le jour de Paris de
 * la remise. Les deux lectures passent par les canaux que le retrait et la
 * livraison publient pour le commerce. Dernier repli : le jour de Paris de
 * l'instant porté par le fait — une remise n'est jamais sans date, même
 * quand aucune attestation n'est encore lisible.
 */
@CommandHandler(MarkOrderFulfilledCommand)
export class MarkOrderFulfilledHandler implements ICommandHandler<MarkOrderFulfilledCommand, void> {
  constructor(
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly handovers: OrderHandoverHistoryReader,
    private readonly deliveries: OrderDeliveryHistoryReader,
  ) {}

  async execute(command: MarkOrderFulfilledCommand): Promise<void> {
    const order = await this.orders.findAuthorByReference(command.reference);
    if (order === null) {
      throw new OrderReferenceNotFoundError(command.reference);
    }

    const receivedOn = await this.receivedOnOf(order.orderId, command.at);
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
        receivedOn,
      );
      if (won) {
        await this.durable.publish(fulfilled.durableFact());
      }
    });
  }

  /** Le jour de réception (`AAAA-MM-JJ`, Paris) : la règle de la facture, sinon le jour du fait. */
  private async receivedOnOf(orderId: string, at: Date): Promise<string> {
    const [handovers, stops] = await Promise.all([
      this.handovers.ofOrders([orderId]),
      this.deliveries.ofOrders([orderId]),
    ]);
    return receivedOnOrDayOf(
      handovers.get(orderId) ?? null,
      stops.filter((stop) => stop.orderId === orderId),
      at,
    );
  }
}
