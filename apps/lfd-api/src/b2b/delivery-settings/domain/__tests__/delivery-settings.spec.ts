import { DeliverySettings } from "../delivery-settings.js";
import { DeliverySettingsUpdatedEvent } from "../delivery-settings.events.js";

const AT = new Date(0);
const AUTHOR = { sub: "auth0|agent", name: "Camille Durand", role: "commercial" };
const OPEN = { openToB2b: true, openToB2c: true };

describe("DeliverySettings.pose", () => {
  it("ne change que la clientèle nommée par le patch", () => {
    const settings = DeliverySettings.pose({
      current: OPEN,
      patch: { openToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    expect(settings.openToB2b).toBe(true);
    expect(settings.openToB2c).toBe(false);
  });

  it("fige l'instant et l'auteur du geste", () => {
    const settings = DeliverySettings.pose({
      current: OPEN,
      patch: { openToB2b: false },
      at: AT,
      author: AUTHOR,
    });

    expect(settings.at).toBe(AT);
    expect(settings.author).toEqual(AUTHOR);
  });

  it("permet de fermer aux deux — le retrait reste", () => {
    const settings = DeliverySettings.pose({
      current: { openToB2b: false, openToB2c: true },
      patch: { openToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.openToB2b, settings.openToB2c]).toEqual([false, false]);
  });
});

describe("DeliverySettingsUpdatedEvent", () => {
  /** Un patch ne touche qu'une case : relire le fait sans l'état remplacé ne dit pas ce qui a changé. */
  it("emporte l'état posé ET l'état remplacé, sous le préfixe rangé au journal", () => {
    const settings = DeliverySettings.pose({
      current: OPEN,
      patch: { openToB2c: false },
      at: AT,
      author: AUTHOR,
    });

    const fact = new DeliverySettingsUpdatedEvent(settings, OPEN).journalFact();

    expect(fact.type).toBe("delivery_settings.updated");
    expect(fact.subjectType).toBe("delivery_settings");
    expect(fact.payload).toEqual({
      openToB2b: true,
      openToB2c: false,
      previous: { openToB2b: true, openToB2c: true },
    });
  });
});
