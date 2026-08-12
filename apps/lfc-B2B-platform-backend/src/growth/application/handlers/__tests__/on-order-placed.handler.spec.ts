import { OrderPlacedEvent } from "../../../../orders/domain/events/order-placed.event.js";
import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { OnOrderPlaced } from "../on-order-placed.handler.js";
import { BackgroundWork } from "../../../../infra/events/background-work.js";

/** Recorder doublé : capture les entrées (extension du port, sans cast). */
class RecordingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

/**
 * L'abonné mappe `OrderPlacedEvent` → une entrée de journal « lead chaud » avec
 * une clé d'idempotence déterministe par commande.
 */
describe("OnOrderPlaced", () => {
  const work = new BackgroundWork();

  it("journalise order.placed sur le sujet user, clé déterministe et payload", async () => {
    const recorder = new RecordingRecorder();
    const handler = new OnOrderPlaced(recorder, work);

    await handler.handle(new OrderPlacedEvent("order_9", "ORD-9", "user_7", "company_3", 4200));

    expect(recorder.records).toHaveLength(1);
    expect(recorder.records[0]).toEqual({
      type: "order.placed",
      subjectType: "user",
      subjectId: "user_7",
      idempotencyKey: "order.placed:order_9",
      payload: {
        orderId: "order_9",
        orderNumber: "ORD-9",
        companyId: "company_3",
        totalCents: 4200,
      },
    });
  });

  it("préserve un companyId nul (commande zéro-friction)", async () => {
    const recorder = new RecordingRecorder();
    new OnOrderPlaced(recorder, work).handle(
      new OrderPlacedEvent("order_1", "ORD-1", "user_1", null, 400),
    );
    await work.whenIdle();
    expect(recorder.records[0]?.payload).toMatchObject({ companyId: null });
  });
});
