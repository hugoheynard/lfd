import { DeliveryAvailability } from "../delivery-availability.js";
import { DeliveryAvailabilityUpdatedEvent } from "../delivery-availability.events.js";
import { InvalidProductionMarginError } from "../production-margin.js";

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
      deliveryMarginMinutes: null,
      pickupMarginMinutes: null,
      previous: {
        openToB2b: true,
        openToB2c: true,
        windowMode: "slot",
        deliveryMarginMinutes: null,
        pickupMarginMinutes: null,
      },
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

describe("DeliveryAvailability.pose — marges de production (vagues, V0)", () => {
  const pose = (
    current: Parameters<typeof DeliveryAvailability.pose>[0]["current"],
    patch: Parameters<typeof DeliveryAvailability.pose>[0]["patch"],
  ) => DeliveryAvailability.pose({ current, patch, at: AT, author: AUTHOR });

  it("n'invente aucune marge : un réglage jamais posé reste non réglé", () => {
    const settings = pose(OPEN, { openToB2b: false });

    expect([settings.deliveryMarginMinutes, settings.pickupMarginMinutes]).toEqual([null, null]);
  });

  it("règle les deux marges indépendamment", () => {
    const settings = pose(OPEN, { deliveryMarginMinutes: 50, pickupMarginMinutes: 20 });

    expect([settings.deliveryMarginMinutes, settings.pickupMarginMinutes]).toEqual([50, 20]);
  });

  it("une marge absente du patch reste telle quelle, `null` l'efface", () => {
    const settings = pose(
      { ...OPEN, deliveryMarginMinutes: 50, pickupMarginMinutes: 20 },
      { pickupMarginMinutes: null },
    );

    expect([settings.deliveryMarginMinutes, settings.pickupMarginMinutes]).toEqual([50, null]);
  });

  it("admet zéro et une journée pleine, bornes comprises", () => {
    const settings = pose(OPEN, { deliveryMarginMinutes: 0, pickupMarginMinutes: 1440 });

    expect([settings.deliveryMarginMinutes, settings.pickupMarginMinutes]).toEqual([0, 1440]);
  });

  it.each([-1, 1441, 12.5])("refuse une marge de livraison de %p minutes", (value) => {
    expect(() => pose(OPEN, { deliveryMarginMinutes: value })).toThrow(
      InvalidProductionMarginError,
    );
  });

  it("nomme la marge refusée et le geste de sortie", () => {
    expect(() => pose(OPEN, { pickupMarginMinutes: -5 })).toThrow(
      /marge de retrait.*videz le champ/su,
    );
  });

  it("le fait du journal porte les marges posées et remplacées", () => {
    const previous = { ...OPEN, deliveryMarginMinutes: 30 };
    const settings = pose(previous, { deliveryMarginMinutes: 45 });

    const payload = new DeliveryAvailabilityUpdatedEvent(settings, previous).journalFact().payload;

    expect(payload).toMatchObject({
      deliveryMarginMinutes: 45,
      pickupMarginMinutes: null,
      previous: { deliveryMarginMinutes: 30, pickupMarginMinutes: null },
    });
  });
});
