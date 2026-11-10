import {
  OrderShortfallDecidedEvent,
  OrderShortfallDecidedPayloadError,
} from "../order-shortfall-decided.event.js";

const decided = (rank: number): OrderShortfallDecidedEvent =>
  new OrderShortfallDecidedEvent(
    "ord_1",
    rank,
    "ORD-1",
    "user_1",
    "fiche_1",
    [{ sku: "CRO", quantity: 3 }],
    "abandoned",
  );

/** Plan E7 reliquat, §4 : une clé oubliée avale le second envoi sans erreur. */
describe("OrderShortfallDecidedEvent — sa clé par envoi", () => {
  it("au rang 1, la clé d'avant, et se relit à l'identique", () => {
    const fact = decided(1).durableFact();
    expect(fact.key).toBe("order.shortfall_decided:ord_1");
    expect(OrderShortfallDecidedEvent.fromPayload(fact.payload)).toEqual(decided(1));
  });

  it("deux rangs, deux clés", () => {
    const two = decided(2).durableFact();
    expect(two.key).toBe("order.shortfall_decided:ord_1:r2");
    expect(OrderShortfallDecidedEvent.fromPayload(two.payload)).toEqual(decided(2));
  });

  it("relit un fait écrit avant le rang au rang 1, refuse un rang nul", () => {
    const { rank: _absent, ...older } = decided(1).durableFact().payload;
    expect(OrderShortfallDecidedEvent.fromPayload(older).rank).toBe(1);
    expect(() => OrderShortfallDecidedEvent.fromPayload({ ...older, rank: 0 })).toThrow(
      OrderShortfallDecidedPayloadError,
    );
  });
});
