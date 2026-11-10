import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderDeliveryHistoryReader } from "../../../../delivery/channels/commerce/index.js";
import { OrderHandoverHistoryReader } from "../../../../handover/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { receivedOnOrDayOf } from "../../../accounting/domain/services/monthly-invoicing.js";
import { OrderReferenceNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderHandedOverEvent } from "../../domain/events/order-handed-over.event.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { OrderLock } from "../../domain/ports/order-lock.js";
import { PendingRemaindersReader } from "../../domain/ports/pending-remainders.reader.js";
import { statusAfterFirstHandover } from "../../domain/services/shipment-settlement.js";
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
 *
 * ## Le bon de livraison suit (plan E2, 2026-10-24)
 *
 * Sous `won`, dans la même unité de travail : le BL passe `handed_over`, avec
 * l'instant et le jour de réception que cette instruction vient d'écrire
 * (plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.3).
 *
 * ## Retirée en partie, ou soldée (plan E7 reliquat, choix 8, lot L5b)
 *
 * Sous le verrou de la commande — celui que prend aussi la remise d'un reste
 * (`HandOverRemainderNoteHandler`), sans quoi les deux remises se croiseraient
 * sans que l'une voie l'autre —, un reste vivant non retiré fait écrire
 * `partially_handed_over` : la première remise est posée, mais ni
 * `order.fulfilled` ni le solde ne partent. C'est la remise du dernier reste
 * qui les écrira (`RemainderSettlement`). Sans reste vivant, rien ne change.
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
    private readonly deliveryNotes: DeliveryNoteFollowing,
    private readonly lock: OrderLock,
    private readonly remainders: PendingRemaindersReader,
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
      await this.lock.lock(order.orderId);
      const status = statusAfterFirstHandover(await this.remainders.anyPending(order.orderId));
      const won = await this.repository.markFulfilled(
        command.reference,
        command.at,
        command.staffUserId,
        command.via,
        receivedOn,
        status,
      );
      if (won) {
        if (status === "fulfilled") {
          await this.durable.publish(fulfilled.durableFact());
        }
        // Plan E2, § 8.3 : le BL passe `handed_over` avec la commande, dans
        // cette transaction — créé plein s'il manquait (remise hors plan).
        await this.deliveryNotes.handOver(order.orderId);
      }
    });
  }

  /** Le jour de réception (`AAAA-MM-JJ`, Paris) : la règle de la facture, sinon le jour du fait. */
  private async receivedOnOf(orderId: string, at: Date): Promise<string> {
    // Séquentiel, pas `Promise.all` : appelé sous une unité de travail, les deux
    // lectures partageraient le client de la transaction, que `pg` file en
    // silence (DeprecationWarning, retiré de pg@9) — cf. le blocage e2e du 2026-10-26.
    const handovers = await this.handovers.ofOrders([orderId]);
    const stops = await this.deliveries.ofOrders([orderId]);
    return receivedOnOrDayOf(
      handovers.get(orderId) ?? null,
      stops.filter((stop) => stop.orderId === orderId),
      at,
    );
  }
}
