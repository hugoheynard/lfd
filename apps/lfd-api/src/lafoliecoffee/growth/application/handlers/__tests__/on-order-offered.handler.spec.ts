import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import {
  OrderOfferFactPayloadError,
  OrderOfferedEvent,
  OrderOfferRevaluedEvent,
} from "../../../../orders/domain/events/order-offered.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderOffered } from "../on-order-offered.handler.js";
import { OnOrderOfferRevalued } from "../on-order-offer-revalued.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/**
 * `order.offered` et `order.offer_revalued` au journal (plan de la commande
 * offerte, O-8). Chaque charge écrite est passée au catalogue des faits : une
 * clé que le contrat refuse serait une ligne illisible pour le back-office.
 */
const CUSTOMERS = new TableCustomers(new Map([["user_7", "Les Mariés"]]));
const OFFERED = new OrderOfferedEvent("order_9", "ORD-9", "user_7", "fiche_1", "event", 4_200, 220);
const REVALUED = new OrderOfferRevaluedEvent("order_9", "ORD-9", "user_7", 1, 5_100, 266);

function delivery(type: string, payload: Readonly<Record<string, unknown>>): DurableDelivery {
  return { eventId: "evt_1", type, payload };
}

describe("OnOrderOffered", () => {
  it("cite la fiche qui a offert, la nature et la valeur, sous le client", async () => {
    const recorder = new RecordingActivityRecorder();
    const run = new OnOrderOffered(
      recorder,
      CUSTOMERS,
      new TableActors(new Map([["fiche_1", "Marie Fournier"]])),
    );

    await run.handle(delivery("order.offered", OFFERED.durableFact().payload));

    const record = recorder.records[0];
    expect(record?.idempotencyKey).toBe("order.offered:order_9");
    expect(record?.subjectId).toBe("user_7");
    expect(record?.payload).toMatchObject({
      subjectLabel: "Les Mariés",
      orderNumber: "ORD-9",
      offeredBy: { id: "fiche_1", name: "Marie Fournier" },
      nature: "event",
      offeredTotalCents: 4_200,
      offeredVatCents: 220,
    });
    expect(JOURNAL_FACTS["order.offered"].payload.safeParse(record?.payload).success).toBe(true);
  });

  it("🔴 ne recopie jamais le texte du motif au journal", () => {
    expect(Object.keys(OFFERED.durableFact().payload)).not.toContain("note");
  });

  it("refuse une charge illisible — une nature hors registre", () => {
    expect(() =>
      OrderOfferedEvent.fromPayload({ ...OFFERED.durableFact().payload, nature: "gift" }),
    ).toThrow(OrderOfferFactPayloadError);
  });
});

describe("OnOrderOfferRevalued", () => {
  it("écrit la valeur après le geste, un témoin par révision", async () => {
    const recorder = new RecordingActivityRecorder();
    const run = new OnOrderOfferRevalued(recorder, CUSTOMERS);

    await run.handle(delivery("order.offer_revalued", REVALUED.durableFact().payload));
    await run.handle(
      delivery("order.offer_revalued", { ...REVALUED.durableFact().payload, revision: 2 }),
    );

    expect(recorder.records.map((record) => record.idempotencyKey)).toEqual([
      "order.offer_revalued:order_9:1",
      "order.offer_revalued:order_9:2",
    ]);
    expect(
      JOURNAL_FACTS["order.offer_revalued"].payload.safeParse(recorder.records[0]?.payload).success,
    ).toBe(true);
  });
});
