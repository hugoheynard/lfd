import { OrderFulfilledPayloadError } from "../../errors/order-fulfilled-payload.error.js";
import { ORDER_FULFILLED, OrderHandedOverEvent } from "../order-handed-over.event.js";

// Recopié tel quel, jamais comparé à une horloge.
const AT = new Date(60_000);

describe("le fait du commerce — `order.fulfilled`", () => {
  it("se relit à l'identique depuis son payload, sous UNE clé par commande", () => {
    const event = new OrderHandedOverEvent("ord_1", "ORD-1", "user_1", "staff_a", AT, "manual");
    const fact = event.durableFact();

    expect(fact).toMatchObject({ type: ORDER_FULFILLED, key: "order.fulfilled:ord_1" });
    expect(OrderHandedOverEvent.fromPayload(fact.payload)).toEqual(event);
  });

  it.each<[string, Readonly<Record<string, unknown>>]>([
    [
      "sans client",
      {
        orderId: "o",
        orderNumber: "N",
        handedOverBy: "a",
        handedOverAt: AT.toISOString(),
        via: "scan",
      },
    ],
    [
      "mode inconnu",
      {
        orderId: "o",
        orderNumber: "N",
        placedByUserId: "u",
        handedOverBy: "a",
        handedOverAt: AT.toISOString(),
        via: "drone",
      },
    ],
  ])("refuse un payload hors contrat (%s)", (_case, payload) => {
    expect(() => OrderHandedOverEvent.fromPayload(payload)).toThrow(OrderFulfilledPayloadError);
  });
});
