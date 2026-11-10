import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { OrderPaidAfterCancellationEvent } from "../../../domain/events/order-paid-after-cancellation.event.js";
import { RecordingCardRefunds } from "../../commands/__tests__/refund-doubles.js";
import { RecordingLock, Steps } from "../../services/__tests__/order-card-doubles.js";
import { RefundPaidAfterCancellation } from "../refund-paid-after-cancellation.handler.js";

/**
 * L'encaissé après annulation se rembourse tout seul (C4.11), par le bloc
 * `card-payment` depuis le lot P1.c du plan M2 : le verrou `orders` d'abord
 * (§3.3, §3.6), puis `CardRefunds.requestRemainder` sur le SUJET — une
 * `remainder` `return` par paiement encaissé, que le bloc rend idempotente.
 */

function delivery(orderId = "ord_1"): DurableDelivery {
  const fact = new OrderPaidAfterCancellationEvent(orderId).durableFact();
  return { eventId: "evt_1", type: fact.type, payload: fact.payload };
}

function scene(announcedCents = 2_340) {
  const steps = new Steps();
  const refunds = new RecordingCardRefunds(announcedCents, steps.seen);
  const handler = new RefundPaidAfterCancellation(new RecordingLock(steps), refunds);
  return { steps, refunds, handler };
}

describe("RefundPaidAfterCancellation (plan M2, lot P1.c)", () => {
  it("prend le verrou de la commande AVANT de demander au bloc", async () => {
    const { steps, handler } = scene();

    await handler.handle(delivery());

    expect(steps.seen).toEqual(["lock:ord_1", "refund:ord_1"]);
  });

  it("demande le reste de chaque paiement encaissé : `return`, `paid_after_cancellation`, tout de suite, sans auteur", async () => {
    const { refunds, handler } = scene();

    await handler.handle(delivery());

    expect(refunds.remainders).toEqual([
      {
        target: { subject: { type: "order", id: "ord_1" } },
        request: {
          nature: "return",
          reason: "paid_after_cancellation",
          schedule: "now",
          requestedBy: null,
        },
      },
    ]);
  });

  it("un fait relivré redemande la même chose : l'idempotence est celle du port, rien d'autre n'est écrit", async () => {
    const { refunds, handler } = scene();

    await handler.handle(delivery());
    await handler.handle(delivery());

    expect(refunds.remainders).toHaveLength(2);
    expect(refunds.remainders[0]).toEqual(refunds.remainders[1]);
  });

  it("plus rien à rendre : le bloc ne crée rien, l'abonné termine sans lever", async () => {
    const { handler } = scene(0);

    await expect(handler.handle(delivery())).resolves.toBeUndefined();
  });
});
