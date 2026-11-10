import {
  OrderCustomerNudges,
  type OrderCustomerNudgesSnapshot,
} from "../../../domain/entities/order-customer-nudges.js";
import {
  CustomerNudgeDelaysReader,
  type CustomerNudgeDelays,
} from "../../../domain/ports/customer-nudge-delays.reader.js";
import {
  OrderCustomerNudgesRepository,
  type LockedOrderCustomerNudges,
} from "../../../domain/ports/order-customer-nudges.repository.js";

/*
 * Les doublés que partagent les suites des deux relances d'un retrait en
 * retard (« Rappel au client », « Avertir le client »). Écrits à la main, en
 * héritant des ports. Les instants ne sont comparés qu'entre eux — la fin du
 * créneau de la fixture et l'horloge fixée du test —, jamais au calendrier.
 */

/** La fin du créneau de la fixture : 10:00 à Paris, 08:00 UTC en septembre. */
export const SLOT_END = new Date("2026-09-11T08:00:00.000Z");

export function minutesAfterEnd(minutes: number): Date {
  return new Date(SLOT_END.getTime() + minutes * 60_000);
}

/** Une commande en retrait, prête, sans relance. */
export function nudgeSnapshot(
  over: Partial<OrderCustomerNudgesSnapshot> = {},
): OrderCustomerNudgesSnapshot {
  return {
    orderId: "order_1",
    reference: "ORD-4812",
    fulfillmentMethod: "pickup",
    status: "ready",
    readyAt: new Date("2026-09-11T05:00:00.000Z"),
    handedOverAt: null,
    serviceDay: "2026-09-11",
    windowEnd: "10:00",
    pickupReminder: null,
    delayWarning: null,
    ...over,
  };
}

/** Une commande, verrouillée par le test ; garde ce que le handler écrit. */
export class OneOrderNudges extends OrderCustomerNudgesRepository {
  readonly saved: OrderCustomerNudgesSnapshot[] = [];

  constructor(
    private readonly snapshot: OrderCustomerNudgesSnapshot | null,
    private readonly locale: LockedOrderCustomerNudges["locale"] = "it",
  ) {
    super();
  }

  override lock(): Promise<LockedOrderCustomerNudges | null> {
    return Promise.resolve(
      this.snapshot === null
        ? null
        : {
            nudges: OrderCustomerNudges.fromSnapshot(this.snapshot),
            placedByUserId: "user_7",
            locale: this.locale,
            pickupLabel: "Le Labo",
          },
    );
  }

  override save(nudges: OrderCustomerNudges): Promise<void> {
    this.saved.push(nudges.toSnapshot());
    return Promise.resolve();
  }
}

/** Les deux délais du réglage, fixés par le test. */
export class FixedNudgeDelays extends CustomerNudgeDelaysReader {
  constructor(
    private readonly value: CustomerNudgeDelays = {
      pickupReminderMinutes: 0,
      delayWarningMinutes: 0,
    },
  ) {
    super();
  }

  override delays(): Promise<CustomerNudgeDelays> {
    return Promise.resolve(this.value);
  }
}
