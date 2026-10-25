import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderCancelledEvent } from "../../../domain/events/order-cancelled.event.js";
import { RecordingNotifier } from "../../commands/__tests__/refund-doubles.js";
import {
  CUSTOMER_CANCELLATION_BELL,
  RingCustomerCancellation,
} from "../ring-customer-cancellation.handler.js";

/** L'instant de la cloche : recopié, comparé à aucune horloge. */
const AT = new Date(0);

function ring(event: OrderCancelledEvent) {
  const notifier = new RecordingNotifier();
  const handler = new RingCustomerCancellation(notifier, new FixedClock(AT));
  const fact = event.durableFact();
  return {
    notifier,
    done: handler.handle({ eventId: "e", type: fact.type, payload: fact.payload }),
  };
}

describe("RingCustomerCancellation (C6.9, Q-C6.8)", () => {
  it("sonne quand un client annule — une clé par commande", async () => {
    const { notifier, done } = ring(
      new OrderCancelledEvent("o1", "ORD-1", "u1", null, null, "due", null, null, "customer", "u1"),
    );
    await done;

    expect(notifier.notices).toEqual([
      expect.objectContaining({
        kind: CUSTOMER_CANCELLATION_BELL,
        link: "/commandes/o1",
        idempotencyKey: `notification:${CUSTOMER_CANCELLATION_BELL}:o1`,
        occurredAt: AT,
      }),
    ]);
  });

  it("se tait quand c'est l'équipe : elle le sait", async () => {
    const { notifier, done } = ring(
      new OrderCancelledEvent("o1", "ORD-1", "u1", "fiche_1", "motif", "due", null),
    );
    await done;

    expect(notifier.notices).toEqual([]);
  });
});
