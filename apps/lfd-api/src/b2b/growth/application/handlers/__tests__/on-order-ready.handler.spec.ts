import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { OrderReadyEvent } from "../../../../orders/domain/events/order-ready.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderReady } from "../on-order-ready.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/** L'instant du colisage : recopié tel quel, comparé à aucune horloge. */
const READY_AT = new Date(0);

function build() {
  const recorder = new RecordingActivityRecorder();
  const customers = new TableCustomers(new Map([["user_7", "Paul Martin"]]));
  const actors = new TableActors(new Map([["fiche_1", "Léa Petit"]]));
  const work = new BackgroundWork();
  return { recorder, work, handler: new OnOrderReady(recorder, customers, actors, work) };
}

/**
 * `order.ready` nomme ce qu'il cite (D5 et D6 du plan des phrases) : la fiche
 * qui a scanné, avec son nom du moment, et le client, sujet de la ligne.
 */
describe("OnOrderReady", () => {
  it("cite la fiche qui a scanné AVEC son nom, et nomme le client", async () => {
    const { handler, recorder, work } = build();

    handler.handle(new OrderReadyEvent("order_9", "ORD-9", "user_7", "fiche_1", READY_AT));
    await work.whenIdle();

    expect(recorder.records).toEqual([
      {
        type: "order.ready",
        subjectType: "user",
        subjectId: "user_7",
        idempotencyKey: "order.ready:order_9",
        payload: {
          subjectLabel: "Paul Martin",
          orderId: "order_9",
          orderNumber: "ORD-9",
          readyBy: { id: "fiche_1", name: "Léa Petit" },
          readyAt: READY_AT.toISOString(),
        },
      },
    ]);
  });

  it("garde la fiche par son seul id quand l'annuaire ne la nomme pas — sans inventer", async () => {
    const { handler, recorder, work } = build();

    handler.handle(new OrderReadyEvent("order_9", "ORD-9", "user_inconnu", "fiche_x", READY_AT));
    await work.whenIdle();

    expect(recorder.records[0]?.payload).toEqual({
      orderId: "order_9",
      orderNumber: "ORD-9",
      readyBy: "fiche_x",
      readyAt: READY_AT.toISOString(),
    });
  });
});
