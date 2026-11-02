import { DEFAULT_ORDER_CUTOFF_SETTINGS } from "@lfd/contracts";

import { InvalidNudgeDelayError, InvalidShelfHoldMinutesError } from "../order-cutoff-errors.js";
import { OrderCutoffSettings } from "../order-cutoff-settings.js";

/** Le réglage du jour même et de ses voisins — le circuit du jour J (lot L3, 2026-11-02). */

const AT = new Date(0);
const AUTHOR = { staffUserId: "staff_agent", name: "Camille", role: "admin" };

function pose(patch: Parameters<typeof OrderCutoffSettings.pose>[0]["patch"]): OrderCutoffSettings {
  return OrderCutoffSettings.pose({
    current: DEFAULT_ORDER_CUTOFF_SETTINGS,
    patch,
    at: AT,
    author: AUTHOR,
  });
}

describe("OrderCutoffSettings", () => {
  it("garde chaque clé absente du geste à sa valeur courante", () => {
    const settings = pose({ sameDayProAllowed: true });

    expect(settings.sameDayProAllowed).toBe(true);
    expect(settings.sameDayPublicAllowed).toBe(false);
    expect(settings.sameDayProOnline).toBe(false);
    expect(settings.sameDayProWithoutCredit).toBe("refuse");
    expect(settings.shelfHoldMinutes).toBe(30);
    expect(settings.sameDayAllowed).toBe(false);
  });

  it.each([5, 15, 120])("accepte une tenue du stock de %s minutes", (minutes) => {
    expect(pose({ shelfHoldMinutes: minutes }).shelfHoldMinutes).toBe(minutes);
  });

  it.each([0, 4, 121, 7.5, Number.NaN])("refuse une tenue du stock de %s minutes", (minutes) => {
    expect(() => pose({ shelfHoldMinutes: minutes })).toThrow(InvalidShelfHoldMinutesError);
  });

  it("le refus nomme les bornes et la valeur reçue", () => {
    expect(() => pose({ shelfHoldMinutes: 200 })).toThrow(/de 5 à 120 \(reçu : 200\)/u);
  });

  it("refuse toujours un délai de relance négatif", () => {
    expect(() => pose({ pickupReminderDelayMinutes: -1 })).toThrow(InvalidNudgeDelayError);
  });

  it("sameAs voit un changement sur chaque réglage du jour J", () => {
    expect(pose({}).sameAs(DEFAULT_ORDER_CUTOFF_SETTINGS)).toBe(true);
    expect(pose({ sameDayProOnline: true }).sameAs(DEFAULT_ORDER_CUTOFF_SETTINGS)).toBe(false);
    expect(
      pose({ sameDayProWithoutCredit: "payment_link" }).sameAs(DEFAULT_ORDER_CUTOFF_SETTINGS),
    ).toBe(false);
    expect(pose({ shelfHoldMinutes: 31 }).sameAs(DEFAULT_ORDER_CUTOFF_SETTINGS)).toBe(false);
  });
});
