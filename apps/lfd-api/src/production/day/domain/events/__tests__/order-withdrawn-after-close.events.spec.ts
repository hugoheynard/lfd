import { OrderWithdrawnAfterCloseEvent } from "../order-withdrawn-after-close.events.js";

// Un instant recopié, jamais comparé à l'horloge.
const AT = new Date(60_000);
const DAY = "2030-03-12";

/** Plan E7 reliquat, §4 : une clé oubliée avale le second envoi sans erreur. */
describe("OrderWithdrawnAfterCloseEvent — sa clé par envoi", () => {
  it("au rang 1, la clé d'avant", () => {
    const fact = new OrderWithdrawnAfterCloseEvent(DAY, "ord_1", 1, "ORD-1", AT).durableFact();
    expect(fact.key).toBe(`production.order_withdrawn_after_close:${DAY}:ord_1`);
    expect(fact.payload).toMatchObject({ orderId: "ord_1", rank: 1 });
  });

  it("deux rangs, deux clés", () => {
    const one = new OrderWithdrawnAfterCloseEvent(DAY, "ord_1", 1, "ORD-1", AT).durableFact();
    const two = new OrderWithdrawnAfterCloseEvent(DAY, "ord_1", 2, "ORD-1", AT).durableFact();
    expect(two.key).toBe(`production.order_withdrawn_after_close:${DAY}:ord_1:r2`);
    expect(two.key).not.toBe(one.key);
  });
});
