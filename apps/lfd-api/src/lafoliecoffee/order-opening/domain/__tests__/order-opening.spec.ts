import { OrderOpening } from "../order-opening.js";
import { OrderOpeningUpdatedEvent } from "../order-opening.events.js";

const AT = new Date(0);
const AUTHOR = { staffUserId: "staff_agent", name: "Camille Durand", role: "commercial" };
const NO_FIRST_DAY = { firstServiceDayB2b: null, firstServiceDayB2c: null } as const;
const OPEN = { ordersOpenToB2b: true, ordersOpenToB2c: true, ...NO_FIRST_DAY } as const;

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
      current: { ordersOpenToB2b: false, ordersOpenToB2c: true, ...NO_FIRST_DAY },
      patch: { ordersOpenToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.ordersOpenToB2b, settings.ordersOpenToB2c]).toEqual([false, false]);
  });
});

describe("OrderOpening.pose — premier jour commandable", () => {
  it("pose une date sans toucher à l'autre clientèle ni aux cases", () => {
    const settings = OrderOpening.pose({
      current: { ...OPEN, firstServiceDayB2b: "2026-11-02" },
      patch: { firstServiceDayB2c: "2026-11-05" },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.firstServiceDayB2b, settings.firstServiceDayB2c]).toEqual([
      "2026-11-02",
      "2026-11-05",
    ]);
    expect([settings.ordersOpenToB2b, settings.ordersOpenToB2c]).toEqual([true, true]);
  });

  it("retire une date par null", () => {
    const settings = OrderOpening.pose({
      current: { ...OPEN, firstServiceDayB2b: "2026-11-02" },
      patch: { firstServiceDayB2b: null },
      at: AT,
      author: AUTHOR,
    });

    expect(settings.firstServiceDayB2b).toBeNull();
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
      ...NO_FIRST_DAY,
      previous: { ordersOpenToB2b: true, ordersOpenToB2c: true, ...NO_FIRST_DAY },
    });
  });
});
