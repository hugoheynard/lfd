import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { OrderCancelledEvent } from "../../../../orders/domain/events/order-cancelled.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderCancelled } from "../on-order-cancelled.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/**
 * `order.cancelled` au journal (plan d'annulation, C3.5 ; lot C6, C6.6, S8).
 * Chaque charge écrite est aussi passée au catalogue des faits : une clé que
 * le contrat refuse serait une ligne illisible pour le back-office.
 */
function handler() {
  const recorder = new RecordingActivityRecorder();
  const run = new OnOrderCancelled(
    recorder,
    new TableCustomers(
      new Map([
        ["user_7", "Paul Martin"],
        ["user_8", "Léa Petit"],
      ]),
    ),
    new TableActors(new Map([["fiche_1", "Marie Fournier"]])),
  );
  return { recorder, run };
}

function delivery(payload: Record<string, unknown>): DurableDelivery {
  return { eventId: "evt_1", type: "order.cancelled", payload };
}

function payloadOf(recorder: RecordingActivityRecorder): Record<string, unknown> {
  const record = recorder.records[0];
  expect(record).toBeDefined();
  return { ...(record?.payload ?? {}) };
}

describe("OnOrderCancelled", () => {
  it("S8 : un fait sérialisé AVANT C6 se journalise comme l'équipe, sans clé client", async () => {
    const { recorder, run } = handler();

    await run.handle(
      delivery({
        orderId: "order_9",
        orderNumber: "ORD-9",
        placedByUserId: "user_7",
        cancelledBy: "fiche_1",
        reason: "Le client a appelé",
        regime: "due",
        voucher: null,
        refund: null,
      }),
    );

    const payload = payloadOf(recorder);
    expect(payload).toMatchObject({
      cancelledBy: { id: "fiche_1", name: "Marie Fournier" },
      reason: "Le client a appelé",
    });
    expect(payload).not.toHaveProperty("cancelledByKind");
    expect(JOURNAL_FACTS["order.cancelled"].payload.safeParse(payload).success).toBe(true);
  });

  it("un membre de la société qui annule est cité par son nom, sans fiche staff", async () => {
    const { recorder, run } = handler();
    const event = new OrderCancelledEvent(
      "order_9",
      "ORD-9",
      "user_7",
      null,
      null,
      "account",
      null,
      null,
      "customer",
      "user_8",
      "wrong_products",
      null,
    );

    await run.handle(delivery({ ...event.durableFact().payload }));

    const payload = payloadOf(recorder);
    expect(payload).toMatchObject({
      cancelledBy: null,
      reason: null,
      cancelledByKind: "customer",
      cancelledByCustomer: { id: "user_8", name: "Léa Petit" },
      reasonCode: "wrong_products",
      policy: null,
    });
    expect(JOURNAL_FACTS["order.cancelled"].payload.safeParse(payload).success).toBe(true);
  });

  it("un invité inconnu de l'annuaire est cité par son id, et le délai appliqué est figé", async () => {
    const { recorder, run } = handler();
    const event = new OrderCancelledEvent(
      "order_9",
      "ORD-9",
      "user_x",
      null,
      null,
      "due",
      null,
      null,
      "guest",
      "user_x",
      null,
      { hoursBefore: 24 },
    );

    await run.handle(delivery({ ...event.durableFact().payload }));

    const payload = payloadOf(recorder);
    expect(payload).toMatchObject({ cancelledByCustomer: "user_x", policy: { hoursBefore: 24 } });
    expect(JOURNAL_FACTS["order.cancelled"].payload.safeParse(payload).success).toBe(true);
  });
});
