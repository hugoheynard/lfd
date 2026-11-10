import { Injectable } from "@nestjs/common";
import type { ShortfallRemainder } from "@lfd/contracts";

import { ShortfallDesk } from "../../../../packing/channels/commerce/index.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { OrderShortfall } from "../../domain/entities/order-shortfall.js";
import { ShortfallDecision } from "../../domain/entities/shortfall-decision.js";
import { OrderShortfallDecidedEvent } from "../../domain/events/order-shortfall-decided.event.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderShortfallRepository } from "../../domain/ports/order-shortfall.repository.js";
import {
  ShortfallDecisionRepository,
  type LockedShortfallSubject,
} from "../../domain/ports/shortfall-decision.repository.js";

/** Qui décide, et du sort du reste. */
export interface ShortfallDepartureAct {
  readonly staffUserId: string;
  readonly remainder: ShortfallRemainder;
}

/**
 * **Décider du départ, une fois la commande verrouillée** — le chemin d'E6b
 * (plan E6, `documentation/commandes/bon-de-livraison.md`, § 12.2 et § 13),
 * partagé par ses deux portes : la décision des managers
 * (`DecideOrderShortfallHandler`) et le départ décidé au comptoir
 * (`HandOverPackedAtCounterHandler`, plan
 * `documentation/commandes/reliquat/reliquat.md`, §2.2.2 —
 * Hugo, 2026-11-03). Extrait plutôt que recopié : un champ ajouté un jour à
 * la décision ne doit pas n'être posé que d'un côté.
 *
 * Dans l'unité de travail de l'appelant, APRÈS le verrou de la commande :
 * l'agrégat juge et résout le signal, le colisage autorise sous le verrou de
 * la fiche (`ShortfallDesk`), le signal puis la décision s'écrivent, le BL
 * de l'envoi se réécrit (`followDecision`), et `order.shortfall_decided`
 * part dans la boîte d'envoi.
 */
@Injectable()
export class ShortfallDeparture {
  constructor(
    private readonly decisions: ShortfallDecisionRepository,
    private readonly shortfalls: OrderShortfallRepository,
    private readonly desk: ShortfallDesk,
    private readonly deliveryNotes: DeliveryNoteFollowing,
    private readonly durable: DurablePublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws les refus de {@link ShortfallDecision.decide} et de `ShortfallDesk.authorize`.
   */
  async decide(
    locked: LockedShortfallSubject,
    shortfall: OrderShortfall,
    act: ShortfallDepartureAct,
  ): Promise<void> {
    const { orderId, rank, reference } = locked.subject;
    const decision = ShortfallDecision.decide(locked.subject, shortfall, {
      id: this.ids.next(),
      decidedAt: this.clock.now(),
      decidedBy: act.staffUserId,
      remainder: act.remainder,
    });
    await this.desk.authorize(orderId, rank, decision.departing, act.staffUserId);
    // Le signal d'abord : la décision désigne sa ligne (clé étrangère).
    await this.shortfalls.save(shortfall);
    await this.decisions.save(decision);
    await this.deliveryNotes.followDecision(orderId, rank);
    await this.durable.publish(
      new OrderShortfallDecidedEvent(
        orderId,
        rank,
        reference,
        locked.placedByUserId,
        act.staffUserId,
        decision.departing,
        act.remainder,
      ).durableFact(),
    );
  }
}
