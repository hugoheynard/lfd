import { OrderReadyPayloadError } from "../../errors/order-ready-payload.error.js";
import { ORDER_READY, OrderReadyFact } from "../order-ready.fact.js";

/**
 * Lot E5 (2026-10-10) : le courriel « prête » relit ce fait dans la boîte
 * d'envoi. Un payload hors forme est une faute d'émetteur, pas une commande.
 */
describe("OrderReadyFact — le fait durable", () => {
  it("porte sa clé par commande, et se relit à l'identique", () => {
    const fact = new OrderReadyFact("ord_1").durableFact();

    expect(fact).toEqual({
      type: ORDER_READY,
      key: "order.ready:ord_1",
      payload: { orderId: "ord_1" },
    });
    expect(OrderReadyFact.fromPayload(fact.payload)).toEqual(new OrderReadyFact("ord_1"));
  });

  it.each([[{}], [{ orderId: "" }], [{ orderId: 42 }]])(
    "refuse un payload hors forme %o",
    (payload) => {
      expect(() => OrderReadyFact.fromPayload(payload)).toThrow(OrderReadyPayloadError);
    },
  );
});
