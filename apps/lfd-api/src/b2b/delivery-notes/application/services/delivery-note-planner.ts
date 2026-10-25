import { Injectable, Logger } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { AppError } from "../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  OrderLinesForDeliveryNote,
  type DeliveryNoteOrder,
} from "../../../orders/domain/ports/order-lines-for-delivery-note.js";
import {
  ShortfallDecisionReader,
  type DecidedDeparture,
} from "../../../orders/domain/ports/shortfall-decision.reader.js";
import { DeliveryNote } from "../../domain/entities/delivery-note.js";
import { departingSourceOf } from "../../domain/services/departing-source.js";
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
 *   confirmée, et un BL préparé ou remis a déjà suivi sa commande (E2).
 *
 * Répond à `DeliveryNoteFollowing.planConfirmed` par `DeliveryNoteFollower`.
 */
@Injectable()
export class DeliveryNotePlanner {
  private readonly logger = new Logger(DeliveryNotePlanner.name);

  constructor(
    private readonly orders: OrderLinesForDeliveryNote,
    private readonly notes: DeliveryNoteRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly decisions: ShortfallDecisionReader,
  ) {}

  async planConfirmed(orderIds: readonly string[], closedAt: Date): Promise<void> {
    const confirmed = await this.orders.confirmedByPlan(orderIds, closedAt);
    if (confirmed.length === 0) {
      return;
    }
    const ids = confirmed.map((order) => order.orderId);
    const [existing, decided] = await Promise.all([
      this.notes.loadForOrders(ids),
      this.decisions.decidedFor(ids),
    ]);
    for (const order of confirmed) {
      const notes = existing.filter((note) => note.orderId === order.orderId);
      const note = this.guardedNoteFor(order, decided.get(order.orderId), notes);
      if (note === null) {
        continue;
      }
      if (notes.length > 0) {
        await this.notes.save(note);
      } else if (!(await this.notes.saveNew(note))) {
        this.logger.warn(
          `BL-1 de la commande ${order.orderNumber} déjà écrit par un geste concurrent : laissé tel quel.`,
        );
      }
    }
  }

  /**
   * 🔴 Régression du 2026-10-24 (CI de dev sur `3e99c9a83`) : un numéro de
   * commande sans `ORD-` levait `InvalidDeliveryNoteNumberError` dans l'unité
   * de travail de l'arrêt, qui s'annulait — absorption comprise : les commandes
   * payées restaient `placed`. Un BL qui ne peut pas naître ne bloque JAMAIS la
   * confirmation : le refus du domaine est journalisé, la commande est sautée,
   * et le réconciliateur la compte (plan E2, § 8.2). Les refus du domaine
   * tombent avant toute écriture : la transaction reste saine.
   */
  private guardedNoteFor(
    order: DeliveryNoteOrder,
    decision: DecidedDeparture | undefined,
    notes: readonly DeliveryNote[],
  ): DeliveryNote | null {
    try {
      // Une commande décidée (E6b) est prévue sur ce qui part, jamais en entier.
      return this.noteFor(departingSourceOf(order, decision), notes);
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      this.logger.warn(
        `Aucun bon de livraison prévu pour la commande ${order.orderNumber} (${order.orderId}) : ` +
          `${error.message} La commande est confirmée quand même.`,
      );
      return null;
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
