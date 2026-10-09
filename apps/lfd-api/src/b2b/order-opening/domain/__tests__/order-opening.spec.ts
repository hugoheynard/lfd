import { OrderOpening } from "../order-opening.js";
import { OrderOpeningUpdatedEvent } from "../order-opening.events.js";

const AT = new Date(0);
const AUTHOR = { staffUserId: "staff_agent", name: "Camille Durand", role: "commercial" };
const OPEN = { ordersOpenToB2b: true, ordersOpenToB2c: true } as const;

describe("OrderOpening.pose", () => {
  it("ne change que la clientèle nommée par le patch", () => {
    const settings = OrderOpening.pose({
      current: OPEN,
      patch: { ordersOpenToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.ordersOpenToB2b, settings.ordersOpenToB2c]).toEqual([true, false]);
  });

  it("fige l'instant et l'auteur du geste", () => {
    const settings = OrderOpening.pose({
      current: OPEN,
      patch: { ordersOpenToB2b: false },
      at: AT,
      author: AUTHOR,
    });

    expect(settings.at).toBe(AT);
    expect(settings.author).toEqual(AUTHOR);
  });

  it("permet de fermer aux deux — le staff saisit toujours", () => {
    const settings = OrderOpening.pose({
      current: { ordersOpenToB2b: false, ordersOpenToB2c: true },
      patch: { ordersOpenToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.ordersOpenToB2b, settings.ordersOpenToB2c]).toEqual([false, false]);
  });
});

describe("OrderOpeningUpdatedEvent", () => {
  /** Un geste ne bascule qu'une case : sans l'état remplacé, on ne sait pas ce qui a changé. */
  it("emporte l'état posé ET l'état remplacé", () => {
    const settings = OrderOpening.pose({
      current: OPEN,
      patch: { ordersOpenToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    const fact = new OrderOpeningUpdatedEvent(settings, OPEN).journalFact();

    expect(fact.type).toBe("order_opening.updated");
    expect(fact.subjectType).toBe("order_opening");
    expect(fact.subjectId).toBe("orders");
    expect(fact.payload).toEqual({
      ordersOpenToB2b: true,
      ordersOpenToB2c: false,
      previous: { ordersOpenToB2b: true, ordersOpenToB2c: true },
    });
  });
});
