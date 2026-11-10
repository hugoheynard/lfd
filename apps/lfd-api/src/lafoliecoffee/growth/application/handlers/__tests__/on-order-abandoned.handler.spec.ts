import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { OrderAbandonedEvent } from "../../../../orders/domain/events/order-abandoned.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderAbandoned } from "../on-order-abandoned.handler.js";
import { TableCustomers } from "./order-fact-doubles.js";

function build() {
  const recorder = new RecordingActivityRecorder();
  const customers = new TableCustomers(new Map([["user_7", "Paul Martin"]]));
  const work = new BackgroundWork();
  return { recorder, work, handler: new OnOrderAbandoned(recorder, customers, work) };
}

/** `order.abandoned` : le client en sujet, nommé, et ce que l'abandon a écrit. */
describe("OnOrderAbandoned", () => {
  it("inscrit l'abandon, le client nommé, une clé par commande", async () => {
    const { handler, recorder, work } = build();

    handler.handle(new OrderAbandonedEvent("order_9", "ORD-9", "user_7", "cancelled"));
    await work.whenIdle();

    expect(recorder.records).toEqual([
      {
        type: "order.abandoned",
        subjectType: "user",
        subjectId: "user_7",
        idempotencyKey: "order.abandoned:order_9",
        payload: {
          subjectLabel: "Paul Martin",
          orderId: "order_9",
          orderNumber: "ORD-9",
          outcome: "cancelled",
        },
      },
    ]);
  });

  it("n'invente pas de nom quand l'annuaire ne connaît pas le client", async () => {
    const { handler, recorder, work } = build();

    handler.handle(new OrderAbandonedEvent("order_9", "ORD-9", "user_inconnu", "failed"));
    await work.whenIdle();

    expect(recorder.records[0]?.payload).toEqual({
      orderId: "order_9",
      orderNumber: "ORD-9",
      outcome: "failed",
    });
  });
});
