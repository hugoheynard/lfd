import {
  CancellationDelayOutOfRangeError,
  CustomerCancellationSettings,
} from "../customer-cancellation-settings.js";

const AT = new Date(0);
const AUTHOR = { staffUserId: "staff_agent", name: "Camille Durand", role: "commercial" };
const NO_DELAY = {
  delayEnabled: false,
  hoursBefore: 24,
  b2cCancellableUntil: "production_plan",
} as const;

describe("CustomerCancellationSettings.pose (C6.5)", () => {
  it("ne change que la clé nommée par le patch", () => {
    const settings = CustomerCancellationSettings.pose({
      current: NO_DELAY,
      patch: { delayEnabled: true },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.delayEnabled, settings.hoursBefore, settings.b2cCancellableUntil]).toEqual([
      true,
      24,
      "production_plan",
    ]);
    expect(settings.author).toEqual(AUTHOR);
  });

  it.each([0, 168])("admet %i heures", (hoursBefore) => {
    expect(
      CustomerCancellationSettings.pose({
        current: NO_DELAY,
        patch: { hoursBefore },
        at: AT,
        author: AUTHOR,
      }).hoursBefore,
    ).toBe(hoursBefore);
  });

  it.each([-1, 169, 1.5])("refuse %s heures, avec la borne dans la phrase", (hoursBefore) => {
    expect(() =>
      CustomerCancellationSettings.pose({
        current: NO_DELAY,
        patch: { hoursBefore },
        at: AT,
        author: AUTHOR,
      }),
    ).toThrow(CancellationDelayOutOfRangeError);
  });

  it("pose l'étape jusqu'où un particulier annule, sans toucher au délai (plan A1)", () => {
    const settings = CustomerCancellationSettings.pose({
      current: NO_DELAY,
      patch: { b2cCancellableUntil: "ready" },
      at: AT,
      author: AUTHOR,
    });

    expect([settings.b2cCancellableUntil, settings.delayEnabled, settings.hoursBefore]).toEqual([
      "ready",
      false,
      24,
    ]);
  });
});
