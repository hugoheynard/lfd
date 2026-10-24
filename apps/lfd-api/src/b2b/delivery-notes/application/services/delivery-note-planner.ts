import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { DeliveryNotePlanning } from "../../../orders/domain/ports/delivery-note-planning.js";
import {
  OrderLinesForDeliveryNote,
  type DeliveryNoteOrder,
} from "../../../orders/domain/ports/order-lines-for-delivery-note.js";
import { DeliveryNote } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";

/**
 * **La prévision du BL à l'arrêt du plan** (plan
 * `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`, § 1 et § 6).
 *
 * Tourne dans l'unité de travail de l'abonné de l'arrêt, après l'absorption :
 * il ne voit donc que les commandes que CET arrêt vient de confirmer.
 *
 * - sans BL : BL-1 prévu, lignes égales à la commande ;
 * - BL-1 encore prévu (re-clôture après réouverture, réannonce, seconde
 *   livraison) : ses lignes sont réécrites, rang et numéro inchangés ;
 * - BL annulé ou plus avancé : rien. Une commande annulée n'est plus
 *   confirmée, et `prepared` / `handed_over` n'existent qu'à partir d'E3.
 */
@Injectable()
export class DeliveryNotePlanner extends DeliveryNotePlanning {
  constructor(
    private readonly orders: OrderLinesForDeliveryNote,
    private readonly notes: DeliveryNoteRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async planConfirmed(orderIds: readonly string[], closedAt: Date): Promise<void> {
    const confirmed = await this.orders.confirmedByPlan(orderIds, closedAt);
    if (confirmed.length === 0) {
      return;
    }
    const existing = await this.notes.loadForOrders(confirmed.map((order) => order.orderId));
    for (const order of confirmed) {
      const notes = existing.filter((note) => note.orderId === order.orderId);
      const note = this.noteFor(order, notes);
      if (note !== null) {
        await this.notes.save(note);
      }
    }
  }

  /** Le BL à écrire pour cette commande, ou `null` s'il n'y a rien à faire. */
  private noteFor(order: DeliveryNoteOrder, notes: readonly DeliveryNote[]): DeliveryNote | null {
    if (notes.length === 0) {
      return DeliveryNote.planFromOrder(this.ids.next(), order, this.clock.now());
    }
    const planned = notes.find((note) => note.status === "planned");
    if (planned === undefined) {
      return null;
    }
    planned.replanFrom(order);
    return planned;
  }
}
