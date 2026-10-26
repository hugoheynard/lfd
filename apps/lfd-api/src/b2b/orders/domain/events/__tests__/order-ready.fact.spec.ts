import { OrderReadyPayloadError } from "../../errors/order-ready-payload.error.js";
import { ORDER_READY, OrderReadyFact } from "../order-ready.fact.js";

/**
 * Lot E5 (2026-10-10) : le courriel « prête » relit ce fait dans la boîte
 * d'envoi. Un payload hors forme est une faute d'émetteur, pas une commande.
 */
describe("OrderReadyFact — le fait durable", () => {
  it("au rang 1, porte la clé d'avant, et se relit à l'identique", () => {
    const fact = new OrderReadyFact("ord_1", 1).durableFact();

    expect(fact).toEqual({
      type: ORDER_READY,
      key: "order.ready:ord_1",
      payload: { orderId: "ord_1", rank: 1 },
    });
    expect(OrderReadyFact.fromPayload(fact.payload)).toEqual(new OrderReadyFact("ord_1", 1));
  });

  /** Plan E7 reliquat, §4 : une clé oubliée avale le second envoi sans erreur. */
  it("deux rangs, deux clés", () => {
    const two = new OrderReadyFact("ord_1", 2).durableFact();

    expect(two.key).toBe("order.ready:ord_1:r2");
    expect(OrderReadyFact.fromPayload(two.payload)).toEqual(new OrderReadyFact("ord_1", 2));
  });

  it("relit un fait écrit avant le rang au rang 1", () => {
    expect(OrderReadyFact.fromPayload({ orderId: "ord_1" })).toEqual(
      new OrderReadyFact("ord_1", 1),
    );
  });

  it.each([[{}], [{ orderId: "" }], [{ orderId: 42 }], [{ orderId: "ord_1", rank: 0 }]])(
    "refuse un payload hors forme %o",
    (payload) => {
      expect(() => OrderReadyFact.fromPayload(payload)).toThrow(OrderReadyPayloadError);
    },
  );
});
