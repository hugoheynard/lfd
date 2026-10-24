import { Injectable } from "@nestjs/common";

import { DeliveryNoteFollowing } from "../../../orders/domain/ports/delivery-note-following.js";
import { OrderProgressForDeliveryNote } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { Clock } from "../../../../platform/time/clock.js";
import { DeliveryNoteAligner } from "./delivery-note-aligner.js";
import { DeliveryNotePlanner } from "./delivery-note-planner.js";

/**
 * **Le BL suit la commande** — l'implémentation de {@link DeliveryNoteFollowing}
 * (plan `documentation/commandes/plan-e2-rattrapage-des-bons.md`, § 8.3).
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
  ) {
    super();
  }

  planConfirmed(orderIds: readonly string[], closedAt: Date): Promise<void> {
    return this.planner.planConfirmed(orderIds, closedAt);
  }

  prepare(orderId: string): Promise<void> {
    return this.follow(orderId, this.clock.now());
  }

  handOver(orderId: string): Promise<void> {
    return this.follow(orderId, this.clock.now());
  }

  voidLiveFor(orderId: string, at: Date): Promise<void> {
    return this.follow(orderId, at);
  }

  /** `now` ne sert qu'à dater une annulation ; les autres instants sont ceux de la commande. */
  private async follow(orderId: string, now: Date): Promise<void> {
    const order = await this.orders.progressOf(orderId);
    if (order === null) {
      return;
    }
    const outcome = await this.aligner.align(order, now);
    this.aligner.report(order, outcome);
  }
}
