import { Injectable } from "@nestjs/common";

import { DeliveryNoteFollowing } from "../../../orders/domain/ports/delivery-note-following.js";
import { OrderProgressForDeliveryNote } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { Clock } from "../../../../platform/time/clock.js";
import { DeliveryNoteAligner } from "./delivery-note-aligner.js";
import { DeliveryNotePlanner } from "./delivery-note-planner.js";
import { OrderBillingCloser } from "./order-billing-closer.js";

/**
 * **Le BL suit la commande** — l'implémentation de {@link DeliveryNoteFollowing}
 * (plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.3).
 *
 * La prévision reste celle d'E1 ; préparer, remettre et annuler passent tous
 * par la même règle que le réconciliateur ({@link DeliveryNoteAligner}) : la
 * commande, relue dans la transaction de l'appelant, dit l'état et les
 * instants, le BL s'y aligne. Un écart non réparable est journalisé, jamais
 * levé : la commande a avancé, et le réconciliateur le comptera.
 */
@Injectable()
export class DeliveryNoteFollower extends DeliveryNoteFollowing {
  constructor(
    private readonly planner: DeliveryNotePlanner,
    private readonly orders: OrderProgressForDeliveryNote,
    private readonly aligner: DeliveryNoteAligner,
    private readonly clock: Clock,
    private readonly billing: OrderBillingCloser,
  ) {
    super();
  }

  planConfirmed(orderIds: readonly string[], closedAt: Date): Promise<void> {
    return this.planner.planConfirmed(orderIds, closedAt);
  }

  prepare(orderId: string): Promise<void> {
    return this.follow(orderId, this.clock.now());
  }

  /**
   * Le BL remis, puis le solde de la commande (E6c1) : dans la même unité de
   * travail, sous le verrou que la remise a posé sur la commande.
   */
  async handOver(orderId: string): Promise<void> {
    await this.follow(orderId, this.clock.now());
    await this.billing.closeLocked(orderId);
  }

  /**
   * Strict : un BL qui ne peut pas suivre la décision la fait échouer — sans
   * quoi elle partirait avec une fiche réduite et un BL plein (plan E6, § 13).
   */
  followDecision(orderId: string): Promise<void> {
    return this.follow(orderId, this.clock.now(), true);
  }

  /** Non strict : un écart non réparable est compté, la révision a eu lieu. */
  followRevision(orderId: string): Promise<void> {
    return this.follow(orderId, this.clock.now(), false, true);
  }

  voidLiveFor(orderId: string, at: Date): Promise<void> {
    return this.follow(orderId, at);
  }

  /** `now` ne sert qu'à dater une annulation ; les autres instants sont ceux de la commande. */
  private async follow(orderId: string, now: Date, strict = false, revised = false): Promise<void> {
    const order = await this.orders.progressOf(orderId);
    if (order === null) {
      return;
    }
    const outcome = await this.aligner.align(order, now, strict, revised);
    this.aligner.report(order, outcome);
  }
}
