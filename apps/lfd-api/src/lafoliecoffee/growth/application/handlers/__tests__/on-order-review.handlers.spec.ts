import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import {
  OrderReviewWithdrawnFact,
  OrderReviewWithdrawnPayloadError,
} from "../../../../orders/domain/events/order-review-withdrawn.fact.js";
import { OrderReviewedFact } from "../../../../orders/domain/events/order-reviewed.fact.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderReviewWithdrawn } from "../on-order-review-withdrawn.handler.js";
import { OnOrderReviewed } from "../on-order-reviewed.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/**
 * `order.reviewed` et `order.review_withdrawn` au journal : le fait publié,
 * inscrit sous le nom du client et de la fiche, et dont la charge passe au
 * catalogue des faits. Instants rendus tels quels, jamais comparés à l'horloge.
 */

const AT = new Date("2026-11-23T08:30:00.000Z");
const CUSTOMERS = new TableCustomers(new Map([["user_7", "Paul Martin"]]));
const ACTORS = new TableActors(new Map([["fiche_1", "Marie Fournier"]]));

function delivery(type: string, payload: Record<string, unknown>): DurableDelivery {
  return { eventId: "evt_1", type, payload };
}

describe("OnOrderReviewed", () => {
  it("inscrit le visa, sous le nom du client et de la fiche, un témoin par visa, sans la note", async () => {
    const recorder = new RecordingActivityRecorder();
    const fact = new OrderReviewedFact("rev_1", "order_9", "ORD-9", "user_7", 2, "fiche_1", AT);

    await new OnOrderReviewed(recorder, CUSTOMERS, ACTORS).handle(
      delivery("order.reviewed", fact.durableFact().payload),
    );

    const record = recorder.records[0];
    expect(record).toMatchObject({
      type: "order.reviewed",
      subjectType: "user",
      subjectId: "user_7",
      idempotencyKey: "order.reviewed:rev_1",
      payload: {
        subjectLabel: "Paul Martin",
        orderId: "order_9",
        orderNumber: "ORD-9",
        reviewedBy: { id: "fiche_1", name: "Marie Fournier" },
        reviewedAt: AT.toISOString(),
        reviewedRevision: 2,
      },
    });
    expect(JOURNAL_FACTS["order.reviewed"].payload.safeParse(record?.payload).success).toBe(true);
  });
});

describe("OnOrderReviewWithdrawn", () => {
  it("inscrit le retrait, sous le nom du client et de la fiche", async () => {
    const recorder = new RecordingActivityRecorder();
    const fact = new OrderReviewWithdrawnFact("rev_1", "order_9", "ORD-9", "user_7", "fiche_1", AT);

    await new OnOrderReviewWithdrawn(recorder, CUSTOMERS, ACTORS).handle(
      delivery("order.review_withdrawn", fact.durableFact().payload),
    );

    const record = recorder.records[0];
    expect(record).toMatchObject({
      type: "order.review_withdrawn",
      idempotencyKey: "order.review_withdrawn:rev_1",
      payload: { withdrawnBy: { id: "fiche_1", name: "Marie Fournier" } },
    });
    expect(JOURNAL_FACTS["order.review_withdrawn"].payload.safeParse(record?.payload).success).toBe(
      true,
    );
  });

  it("refuse un fait illisible, sans rien inscrire", async () => {
    const recorder = new RecordingActivityRecorder();

    await expect(
      new OnOrderReviewWithdrawn(recorder, CUSTOMERS, ACTORS).handle(
        delivery("order.review_withdrawn", { orderId: "order_9" }),
      ),
    ).rejects.toThrow(OrderReviewWithdrawnPayloadError);
    expect(recorder.records).toEqual([]);
  });
});
