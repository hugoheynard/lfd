import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { OrderHandedOverEvent } from "../../../../orders/domain/events/order-handed-over.event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnOrderHandedOver } from "../on-order-handed-over.handler.js";
import { TableActors, TableCustomers } from "./order-fact-doubles.js";

/** L'instant du retrait : recopié tel quel, comparé à aucune horloge. */
const HANDED_OVER_AT = new Date(0);

/** Le fait tel que le relais le livre : relu depuis son payload, comme en vrai. */
function deliveryOf(event: OrderHandedOverEvent): DurableDelivery {
  const fact = event.durableFact();
  return { eventId: "evt_1", type: fact.type, payload: fact.payload };
}

/**
 * `order.handed_over` nomme ce qu'il cite (D5 et D6 du plan des phrases) : la
 * fiche qui a remis, avec son nom du moment, et le client, sujet de la ligne.
 */
describe("OnOrderHandedOver", () => {
  it("cite la fiche qui a remis AVEC son nom — renommée ensuite, la ligne ne bouge pas", async () => {
    const recorder = new RecordingActivityRecorder();
    const staff = new Map([["fiche_1", "Léa Petit"]]);
    const handler = new OnOrderHandedOver(
      recorder,
      new TableCustomers(new Map([["user_7", "Paul Martin"]])),
      new TableActors(staff),
    );

    await handler.handle(
      deliveryOf(
        new OrderHandedOverEvent("order_9", "ORD-9", "user_7", "fiche_1", HANDED_OVER_AT, "scan"),
      ),
    );
    staff.set("fiche_1", "Léa Durand");

    expect(recorder.records[0]).toMatchObject({
      type: "order.handed_over",
      subjectId: "user_7",
      payload: {
        subjectLabel: "Paul Martin",
        orderNumber: "ORD-9",
        handedOverBy: { id: "fiche_1", name: "Léa Petit" },
        handedOverAt: HANDED_OVER_AT.toISOString(),
        via: "scan",
      },
      idempotencyKey: "order.handed_over:order_9",
    });
  });

  it("un payload hors contrat échoue — la livraison reste en message mort, visible", async () => {
    const handler = new OnOrderHandedOver(
      new RecordingActivityRecorder(),
      new TableCustomers(new Map()),
      new TableActors(new Map()),
    );

    await expect(
      handler.handle({ eventId: "evt_1", type: "order.fulfilled", payload: { orderId: "o" } }),
    ).rejects.toThrow(/illisible/u);
  });
});
