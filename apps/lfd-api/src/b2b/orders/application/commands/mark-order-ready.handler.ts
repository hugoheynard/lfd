import type { OrderPackingView } from "@lfd/contracts";
import { CommandHandler, EventBus, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  OrderReferenceNotFoundError,
  PackingRefusedError,
} from "../../domain/errors/order-errors.js";
import { OrderReadyEvent } from "../../domain/events/order-ready.event.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
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
 */
@CommandHandler(MarkOrderReadyCommand)
export class MarkOrderReadyHandler implements ICommandHandler<
  MarkOrderReadyCommand,
  OrderPackingView
> {
  constructor(
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly clock: Clock,
    private readonly events: EventBus,
  ) {}

  async execute(command: MarkOrderReadyCommand): Promise<OrderPackingView> {
    const order = await this.orders.findForPacking(command.reference);
    if (order === null) {
      throw new OrderReferenceNotFoundError(command.reference);
    }
    const blocker = packingBlocker(order);
    if (blocker !== null) {
      throw new PackingRefusedError(blocker);
    }

    const at = this.clock.now();
    const won = await this.repository.markReady(command.reference, at, command.staffSubject);
    if (!won) {
      // Perdu la course : un autre poste a scanné la même feuille entre notre
      // lecture et notre écriture. On ne réécrit rien — le colisage de l'autre
      // est le seul vrai, et deux mains sur la même commande est le cas NORMAL
      // au fournil, pas une anomalie.
      throw new PackingRefusedError("Cette commande vient d'être déclarée prête ailleurs.");
    }

    // Publié APRÈS l'écriture, et seulement par le GAGNANT de la course : le
    // perdant a levé plus haut. Un second poste qui scanne la même feuille ne
    // fait donc pas partir un second courriel au client.
    this.events.publish(new OrderReadyEvent(order.orderId, order.orderNumber));

    return toPackingView({ ...order, status: "ready", readyAt: at, readyBy: command.staffSubject });
  }
}
