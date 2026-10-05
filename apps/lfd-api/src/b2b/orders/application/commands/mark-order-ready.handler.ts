import type { OrderPackingView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import {
  OrderReferenceNotFoundError,
  PackingRefusedError,
} from "../../domain/errors/order-errors.js";
import { OrderReadyEvent } from "../../domain/events/order-ready.event.js";
import { OrderReader, type PackingOrder } from "../../domain/ports/order.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { packingBlocker } from "../../domain/services/packing.js";
import { toPackingView } from "../queries/get-packing.handler.js";
import { MarkOrderReadyCommand } from "./mark-order-ready.command.js";

/**
 * Le **colisage** : lire, juger, graver — et rendre ce qui a été gravé.
 *
 * Comme la remise, cette commande rend une vue plutôt qu'un identifiant, et
 * c'est assumé : entre deux fournées, la confirmation doit s'afficher dans la
 * seconde, sans second aller-retour. Ce n'est pas un modèle de lecture déguisé
 * — c'est l'accusé de réception de l'écriture.
 *
 * **La deuxième transition de statut du système.** La remise était la première ;
 * rien d'autre ne faisait avancer une commande au-delà de `placed`. Celle-ci
 * comble le trou du milieu : personne au comptoir ne pouvait savoir si un sac
 * était prêt sans traverser le fournil pour aller voir.
 *
 * ## Idempotente, depuis le 2026-10-04
 *
 * Son seul appelant est l'abonné DURABLE du colisage (`OnPackingOrderPacked`,
 * vérifié le 2026-10-05), livré au moins une fois et à chaque réannonce. Une
 * commande déjà prête — par un fait précédent ou par l'autre côté d'une course —
 * est donc un succès SANS effet : ni écriture, ni `OrderReadyEvent`, donc ni
 * second courriel ni seconde ligne de journal. Avant, elle levait
 * `PackingRefusedError` (« déjà déclarée prête ») : un rescan échouait en
 * silence, et sous la boîte d'envoi il aurait fini en message mort.
 *
 * Les autres refus restent des refus (annulée, pas encore passée, déjà retirée
 * sans avoir été prête) : ce sont de vraies divergences, qu'un message mort
 * visible dans la carte de santé doit montrer.
 */
@CommandHandler(MarkOrderReadyCommand)
export class MarkOrderReadyHandler implements ICommandHandler<
  MarkOrderReadyCommand,
  OrderPackingView
> {
  constructor(
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly events: DomainEventPublisher,
    private readonly staffAuthors: StaffAuthorDirectory,
    private readonly afterCommit: AfterCommit,
  ) {}

  async execute(command: MarkOrderReadyCommand): Promise<OrderPackingView> {
    const order = await this.orders.findForPacking(command.reference);
    if (order === null) {
      throw new OrderReferenceNotFoundError(command.reference);
    }
    if (order.readyAt !== null) {
      return this.viewOf(order);
    }
    const blocker = packingBlocker(order);
    if (blocker !== null) {
      throw new PackingRefusedError(blocker);
    }

    // L'instant vient de la COMMANDE — donc du fait constaté au fournil — et
    // non de l'horloge d'ici. Cf. `MarkOrderReadyCommand.at`.
    const at = command.at;
    const won = await this.repository.markReady(command.reference, at, command.staffUserId);
    if (!won) {
      // Perdu la course : une autre livraison a écrit entre notre lecture et
      // notre écriture — ou une annulation. On ne réécrit rien et on ne publie
      // rien ; on relit pour dire ce qui est vraiment en base.
      return this.afterLostRace(command.reference);
    }

    // Publié APRÈS l'écriture, et seulement par le GAGNANT de la course. Et
    // après la VALIDATION (depuis le 2026-10-04) : ce handler tourne dans l'unité
    // de travail de la livraison durable, et un abonné en mémoire lancé dedans
    // héritait de sa transaction — le témoin `order.ready` s'écrivait sur une
    // transaction close, et `record` l'avalait (e2e `production-batch`). Il ne
    // part plus non plus pour une écriture qu'une validation ratée annulerait.
    const ready = new OrderReadyEvent(
      order.orderId,
      order.orderNumber,
      order.placedByUserId,
      command.staffUserId,
      at,
    );
    this.afterCommit.defer(() => {
      this.events.publish(ready);
    }, "order-ready");

    return this.viewOf({ ...order, status: "ready", readyAt: at, readyBy: command.staffUserId });
  }

  /**
   * Après une course perdue : déjà prête = succès sans effet ; sinon, la
   * commande a changé d'état entre-temps, et c'est son refus qui le dit.
   */
  private async afterLostRace(reference: string): Promise<OrderPackingView> {
    const reloaded = await this.orders.findForPacking(reference);
    if (reloaded === null) {
      throw new OrderReferenceNotFoundError(reference);
    }
    if (reloaded.readyAt !== null) {
      return this.viewOf(reloaded);
    }
    throw new PackingRefusedError(
      packingBlocker(reloaded) ?? "Cette commande vient de changer d'état ailleurs.",
    );
  }

  private async viewOf(order: PackingOrder): Promise<OrderPackingView> {
    const authors = await this.staffAuthors.identify([order.readyBy]);
    return toPackingView(order, authors);
  }
}
