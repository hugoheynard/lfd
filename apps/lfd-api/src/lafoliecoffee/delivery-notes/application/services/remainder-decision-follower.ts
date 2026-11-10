import { Injectable } from "@nestjs/common";

import { OrderProgressForDeliveryNote } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { RemainderDecisionReader } from "../../../orders/domain/ports/shortfall-decision.reader.js";
import { DecisionNoteNotFollowedError } from "../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";
import { remainderDecisionSourceOf } from "../../domain/services/remainder-decision-source.js";

/**
 * **Le BL d'un reliquat suit la décision de son départ** (plan E7 reliquat,
 * lot LB, choix 10 et 11) : le BL vivant du rang décidé, encore prévu, se
 * réécrit sur ses propres lignes réduites aux quantités décidées, ses
 * montants recomposés. Le BL-1 et la commande ne bougent pas.
 *
 * Strict, comme la décision du rang 1 : tout écart lève, et la décision
 * entière est annulée — sans quoi elle partirait avec une fiche réduite et un
 * BL plein. Tourne dans l'unité de travail de la décision, sous le verrou de
 * la commande qu'elle a posé.
 */
@Injectable()
export class RemainderDecisionFollower {
  constructor(
    private readonly orders: OrderProgressForDeliveryNote,
    private readonly notes: DeliveryNoteRepository,
    private readonly decisions: RemainderDecisionReader,
  ) {}

  /** @throws {DecisionNoteNotFollowedError} et les refus de `replanFrom`. */
  async follow(orderId: string, rank: number): Promise<void> {
    const [order, notes, decision] = await Promise.all([
      this.orders.progressOf(orderId),
      this.notes.loadForOrders([orderId]),
      this.decisions.decisionOf(orderId, rank),
    ]);
    const reference = order?.orderNumber ?? orderId;
    const note = notes.find((candidate) => candidate.rank === rank && candidate.isLive);
    if (order === null || note === undefined || decision === null) {
      throw new DecisionNoteNotFollowedError(
        `${reference} (reste n° ${String(rank)})`,
        note === undefined ? "aucun bon de livraison vivant de ce rang" : "décision introuvable",
      );
    }
    note.replanFrom(remainderDecisionSourceOf(order.orderNumber, note, decision));
    await this.notes.save(note);
  }
}
