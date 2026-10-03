import { DeliveryAvailability } from "../delivery-availability.js";
import { DeliveryAvailabilityUpdatedEvent } from "../delivery-availability.events.js";

const AT = new Date(0);
const AUTHOR = { staffUserId: "staff_agent", name: "Camille Durand", role: "commercial" };
const OPEN = { openToB2b: true, openToB2c: true, windowMode: "slot" } as const;

describe("DeliveryAvailability.pose", () => {
  it("ne change que la clientèle nommée par le patch", () => {
    const settings = DeliveryAvailability.pose({
      current: OPEN,
      patch: { openToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    expect(settings.openToB2b).toBe(true);
    expect(settings.openToB2c).toBe(false);
  });

  it("fige l'instant et l'auteur du geste", () => {
    const settings = DeliveryAvailability.pose({
      current: OPEN,
      patch: { openToB2b: false },
      at: AT,
      author: AUTHOR,
    });

    expect(settings.at).toBe(AT);
    expect(settings.author).toEqual(AUTHOR);
  });

  it("permet de fermer aux deux — le retrait reste", () => {
    const settings = DeliveryAvailability.pose({
      current: { openToB2b: false, openToB2c: true, windowMode: "slot" },
      patch: { openToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.openToB2b, settings.openToB2c]).toEqual([false, false]);
  });
});

describe("DeliveryAvailabilityUpdatedEvent", () => {
  /** Un patch ne touche qu'une case : relire le fait sans l'état remplacé ne dit pas ce qui a changé. */
  it("emporte l'état posé ET l'état remplacé, sous le préfixe rangé au journal", () => {
    const settings = DeliveryAvailability.pose({
      current: OPEN,
      patch: { openToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    const fact = new DeliveryAvailabilityUpdatedEvent(settings, OPEN).journalFact();

    expect(fact.type).toBe("delivery_availability.updated");
    expect(fact.subjectType).toBe("delivery_availability");
    expect(fact.payload).toEqual({
      openToB2b: true,
      openToB2c: false,
      windowMode: "slot",
      previous: { openToB2b: true, openToB2c: true, windowMode: "slot" },
    });
  });
});

describe("DeliveryAvailability.pose — créneau ou échéance (CA-D2)", () => {
  it("passe en échéance sans toucher aux clientèles", () => {
    const settings = DeliveryAvailability.pose({
      current: OPEN,
      patch: { windowMode: "deadline" },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.openToB2b, settings.openToB2c, settings.windowMode]).toEqual([
      true,
      true,
      "deadline",
    ]);
  });

  it("un patch qui ne dit rien du mode le laisse tel quel", () => {
    const settings = DeliveryAvailability.pose({
      current: { ...OPEN, windowMode: "deadline" },
      patch: { openToB2b: false },
      at: AT,
      author: AUTHOR,
    });

    expect(settings.windowMode).toBe("deadline");
  });
});
