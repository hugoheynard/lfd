import {
  ORDER_REVIEWED,
  OrderReviewedFact,
} from "../../../../orders/domain/events/order-reviewed.fact.js";
import { OrderAlertsAcknowledger } from "../../../domain/ports/order-alerts.js";
import { OnOrderReviewedAcknowledgeAlerts } from "../on-order-reviewed.handler.js";

/** Les acquittements demandés, dans l'ordre. */
class RecordingAcknowledger extends OrderAlertsAcknowledger {
  readonly calls: { orderId: string; staffUserId: string; at: Date }[] = [];

  acknowledgeOrder(orderId: string, staffUserId: string, at: Date): Promise<void> {
    this.calls.push({ orderId, staffUserId, at });
    return Promise.resolve();
  }
}

/** L'instant du visa ne se compare qu'à lui-même. */
const REVIEWED_AT = new Date(Date.UTC(2026, 10, 23, 9));

describe("OnOrderReviewedAcknowledgeAlerts", () => {
  it("acquitte les alertes de la commande au nom de qui l'a visée, à l'instant du visa", async () => {
    const acknowledger = new RecordingAcknowledger();
    const fact = new OrderReviewedFact(
      "rev_1",
      "ord_1",
      "LFC-0001",
      "user_1",
      0,
      "stf_1",
      REVIEWED_AT,
    );

    await new OnOrderReviewedAcknowledgeAlerts(acknowledger).handle({
      eventId: "evt_1",
      type: ORDER_REVIEWED,
      payload: fact.durableFact().payload,
    });

    expect(acknowledger.calls).toEqual([
      { orderId: "ord_1", staffUserId: "stf_1", at: REVIEWED_AT },
    ]);
  });

  it("refuse un fait illisible sans rien acquitter", async () => {
    const acknowledger = new RecordingAcknowledger();

    await expect(
      new OnOrderReviewedAcknowledgeAlerts(acknowledger).handle({
        eventId: "evt_2",
        type: ORDER_REVIEWED,
        payload: { orderId: "ord_1" },
      }),
    ).rejects.toThrow(/illisible/);
    expect(acknowledger.calls).toEqual([]);
  });
});
