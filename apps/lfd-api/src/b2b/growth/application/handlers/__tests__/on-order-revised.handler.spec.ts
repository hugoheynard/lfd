import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { OrderRevisedEvent } from "../../../../orders/domain/events/order-revised.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderRevised } from "../on-order-revised.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/**
 * `order.revised` au journal (plan `documentation/commandes/plan-modifier-une-commande.md`,
 * M1). Chaque charge écrite est passée au catalogue des faits : une clé que le
 * contrat refuse serait une ligne illisible pour le back-office.
 */
function handler() {
  const recorder = new RecordingActivityRecorder();
  const run = new OnOrderRevised(
    recorder,
    new TableCustomers(new Map([["user_7", "Paul Martin"]])),
    new TableActors(new Map([["fiche_1", "Marie Fournier"]])),
  );
  return { recorder, run };
}

function delivery(event: OrderRevisedEvent): DurableDelivery {
  return { eventId: "evt_1", type: "order.revised", payload: event.durableFact().payload };
}

describe("OnOrderRevised", () => {
  it("une modification par l'équipe cite la fiche, sous son nom du moment", async () => {
    const { recorder, run } = handler();

    await run.handle(
      delivery(
        new OrderRevisedEvent(
          "order_9",
          "ORD-9",
          "user_7",
          2,
          { kind: "staff", staffId: "fiche_1" },
          ["lines", "date"],
          2_110,
          3_165,
        ),
      ),
    );

    const record = recorder.records[0];
    expect(record?.idempotencyKey).toBe("order.revised:order_9:2");
    expect(record?.payload).toMatchObject({
      subjectLabel: "Paul Martin",
      revision: 2,
      revisedBy: { id: "fiche_1", name: "Marie Fournier" },
      changes: ["lines", "date"],
    });
    expect(record?.payload).not.toHaveProperty("revisedByCustomer");
    expect(JOURNAL_FACTS["order.revised"].payload.safeParse(record?.payload).success).toBe(true);
  });

  it("une modification par le client le cite, sans fiche staff", async () => {
    const { recorder, run } = handler();

    await run.handle(
      delivery(
        new OrderRevisedEvent(
          "order_9",
          "ORD-9",
          "user_7",
          1,
          { kind: "customer", userId: "user_7" },
          ["note"],
          2_110,
          2_110,
        ),
      ),
    );

    const payload = recorder.records[0]?.payload;
    expect(payload).toMatchObject({
      revisedBy: null,
      revisedByCustomer: { id: "user_7", name: "Paul Martin" },
    });
    expect(JOURNAL_FACTS["order.revised"].payload.safeParse(payload).success).toBe(true);
  });

  it("un fait illisible rejette, sans rien écrire", async () => {
    const { recorder, run } = handler();

    await expect(
      run.handle({ eventId: "evt_1", type: "order.revised", payload: { orderId: "order_9" } }),
    ).rejects.toThrow("illisible");
    expect(recorder.records).toEqual([]);
  });
});
