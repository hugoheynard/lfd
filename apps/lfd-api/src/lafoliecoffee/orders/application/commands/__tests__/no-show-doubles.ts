import {
  OrderHandoverHistoryReader,
  type OrderHandoverHistoryFact,
} from "../../../../../handover/channels/commerce/index.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";
import type { DurableFact } from "../../../../../platform/outbox/durable-event.js";
import { OrderNoShow, type OrderNoShowSnapshot } from "../../../domain/entities/order-no-show.js";
import {
  OrderNoShowRepository,
  type LockedOrderNoShow,
} from "../../../domain/ports/order-no-show.repository.js";

/*
 * Les doublés que partagent les suites des deux gestes d'une commande non
 * retirée. Écrits à la main, en héritant des ports. Les instants ne sont
 * comparés qu'entre eux — la fin du créneau de la fixture et l'horloge fixée
 * du test —, jamais au calendrier.
 */

/** La fin du créneau de la fixture : 10:00 à Paris, 08:00 UTC en septembre. */
export const SLOT_END = new Date("2026-09-11T08:00:00.000Z");

export function minutesAfterEnd(minutes: number): Date {
  return new Date(SLOT_END.getTime() + minutes * 60_000);
}

/** Une commande à régler en boutique, prête, jamais retirée. */
export function noShowSnapshot(over: Partial<OrderNoShowSnapshot> = {}): OrderNoShowSnapshot {
  return {
    orderId: "order_1",
    reference: "ORD-4812",
    status: "ready",
    settlementVenue: "shop_till",
    handedOver: false,
    serviceDay: "2026-09-11",
    windowEnd: "10:00",
    declared: null,
    noticeRequested: null,
    ...over,
  };
}

/** Une commande, verrouillée par le test ; garde ce que le handler écrit, et dans quel ordre. */
export class OneOrderNoShow extends OrderNoShowRepository {
  readonly saved: OrderNoShowSnapshot[] = [];
  locks = 0;

  constructor(private snapshot: OrderNoShowSnapshot | null) {
    super();
  }

  override lock(): Promise<LockedOrderNoShow | null> {
    this.locks += 1;
    return Promise.resolve(
      this.snapshot === null
        ? null
        : {
            noShow: OrderNoShow.fromSnapshot(this.snapshot),
            placedByUserId: "user_7",
            locale: "it",
            pickupLabel: "Le Labo",
          },
    );
  }

  override save(noShow: OrderNoShow): Promise<void> {
    this.snapshot = noShow.toSnapshot();
    this.saved.push(this.snapshot);
    return Promise.resolve();
  }
}

/** Le retrait, tel que le test le fixe : les commandes dont il atteste la remise. */
export class FixedHandoverHistory extends OrderHandoverHistoryReader {
  constructor(private readonly attested: readonly string[] = []) {
    super();
  }

  override ofOrders(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, OrderHandoverHistoryFact>> {
    return Promise.resolve(
      new Map(
        orderIds
          .filter((id) => this.attested.includes(id))
          .map((orderId) => [
            orderId,
            { orderId, handedOverAt: SLOT_END, via: "scan" as const, atDoor: false },
          ]),
      ),
    );
  }
}

/** La boîte d'envoi doublée : les faits publiés. */
export class RecordingFacts extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  override publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}
