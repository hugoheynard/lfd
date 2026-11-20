import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { OrderNoShowFact } from "../../../../orders/domain/events/order-no-show.fact.js";
import { OrderNoShowPayloadError } from "../../../../orders/domain/errors/order-no-show-errors.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderNoShow } from "../on-order-no-show.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/**
 * `order.no_show` au journal : le fait que la commande publie, inscrit sous le
 * nom du client, avec la fiche qui l'a déclarée. La charge écrite passe au
 * catalogue des faits : une clé que le contrat refuse serait une ligne
 * illisible pour le back-office. Instants rendus tels quels, jamais comparés
 * à l'horloge.
 */

const AT = new Date("2026-09-11T08:30:00.000Z");

function handler() {
  const recorder = new RecordingActivityRecorder();
  const run = new OnOrderNoShow(
    recorder,
    new TableCustomers(new Map([["user_7", "Paul Martin"]])),
    new TableActors(new Map([["fiche_1", "Marie Fournier"]])),
  );
  return { recorder, run };
}

function delivery(payload: Record<string, unknown>): DurableDelivery {
  return { eventId: "evt_1", type: "order.no_show", payload };
}

describe("OnOrderNoShow", () => {
  it("inscrit le fait publié, sous le nom du client et de la fiche, une fois par commande", async () => {
    const { recorder, run } = handler();
    const fact = new OrderNoShowFact("order_9", "ORD-9", "user_7", "fiche_1", AT).durableFact();

    await run.handle(delivery(fact.payload));

    const record = recorder.records[0];
    expect(record).toMatchObject({
      type: "order.no_show",
      subjectType: "user",
      subjectId: "user_7",
      idempotencyKey: "order.no_show:order_9",
      payload: {
        subjectLabel: "Paul Martin",
        orderId: "order_9",
        orderNumber: "ORD-9",
        noShowBy: { id: "fiche_1", name: "Marie Fournier" },
        noShowAt: AT.toISOString(),
      },
    });
    expect(JOURNAL_FACTS["order.no_show"].payload.safeParse(record?.payload).success).toBe(true);
  });

  it("refuse un fait illisible, sans rien inscrire", async () => {
    const { recorder, run } = handler();

    await expect(run.handle(delivery({ orderId: "order_9" }))).rejects.toThrow(
      OrderNoShowPayloadError,
    );
    expect(recorder.records).toEqual([]);
  });
});
