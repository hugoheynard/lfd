import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import {
  OrderShortfallDecidedEvent,
  OrderShortfallDecidedPayloadError,
} from "../../../../orders/domain/events/order-shortfall-decided.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderShortfallDecided } from "../on-order-shortfall-decided.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/**
 * `order.shortfall_decided` au journal (plan
 * `documentation/commandes/plan-e6c2-la-facture-lit-les-montants-facturables.md`
 * § 5). La charge écrite est passée au catalogue des faits : une clé que le
 * contrat refuse serait une ligne illisible pour le back-office.
 */
function handler() {
  const recorder = new RecordingActivityRecorder();
  const run = new OnOrderShortfallDecided(
    recorder,
    new TableCustomers(new Map([["user_7", "Paul Martin"]])),
    new TableActors(new Map([["fiche_1", "Marie Fournier"]])),
  );
  return { recorder, run };
}

const EVENT = new OrderShortfallDecidedEvent(
  "order_9",
  "ORD-9",
  "user_7",
  "fiche_1",
  [{ sku: "CRO", quantity: 9 }],
  "abandoned",
);

function delivery(payload: Readonly<Record<string, unknown>>): DurableDelivery {
  return { eventId: "evt_1", type: "order.shortfall_decided", payload };
}

describe("OnOrderShortfallDecided", () => {
  it("cite la fiche qui a décidé, ce qui part et le reste, sous le client", async () => {
    const { recorder, run } = handler();

    await run.handle(delivery(EVENT.durableFact().payload));

    const record = recorder.records[0];
    expect(record?.idempotencyKey).toBe("order.shortfall_decided:order_9");
    expect(record?.subjectId).toBe("user_7");
    expect(record?.payload).toMatchObject({
      subjectLabel: "Paul Martin",
      orderNumber: "ORD-9",
      decidedBy: { id: "fiche_1", name: "Marie Fournier" },
      departing: [{ sku: "CRO", quantity: 9 }],
      remainder: "abandoned",
    });
    expect(
      JOURNAL_FACTS["order.shortfall_decided"].payload.safeParse(record?.payload).success,
    ).toBe(true);
  });

  it("une charge illisible n'écrit rien et le dit", async () => {
    const { recorder, run } = handler();

    await expect(
      run.handle(delivery({ ...EVENT.durableFact().payload, remainder: "to_redeliver" })),
    ).rejects.toThrow(OrderShortfallDecidedPayloadError);
    expect(recorder.records).toEqual([]);
  });
});
