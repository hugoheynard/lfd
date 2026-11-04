import type { OrderCutoffView } from "@lfd/contracts";

import { ensureWithinOrderCutoff, foreseenWaiver } from "../order-cutoff-guard.js";

/**
 * **La dérogation prévue = la dérogation dépensée** (plan `le-prix-d-un-panier.md`,
 * T1). Dates absolues, exception écrite : `now` est un paramètre, comparé aux
 * seules dates de la fixture. Le 12 août 2026, heure d'été : « la veille à
 * 18 h » tombe le 11 à `16:00Z`, la grâce d'une heure finit à `17:00Z`.
 */
const DAY = "2026-08-12";
const RULE: OrderCutoffView = {
  id: "def",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 60,
};
const BEFORE = "2026-08-11T15:00:00.000Z";
const IN_GRACE = "2026-08-11T16:30:00.000Z";
const AFTER_GRACE = "2026-08-11T17:30:00.000Z";

function inputAt(now: string, waiver: { id: string } | null) {
  return {
    lines: [{ sku: "VIE-001", limit: null }],
    fallback: [RULE],
    fulfillmentDate: DAY,
    waiver,
    now: new Date(now),
  };
}

describe("foreseenWaiver — la décision de la passation, sans refus", () => {
  it("dans la grâce, avec dérogation : rend celle que la passation dépenserait", () => {
    const input = inputAt(IN_GRACE, { id: "w_1" });
    expect(foreseenWaiver(input)).toBe("w_1");
    expect(ensureWithinOrderCutoff(input)).toBe("w_1");
  });

  it("dans la grâce, sans dérogation : rien, là où la passation refuse", () => {
    const input = inputAt(IN_GRACE, null);
    expect(foreseenWaiver(input)).toBeNull();
    expect(() => ensureWithinOrderCutoff(input)).toThrow();
  });

  it("après la grâce, même avec dérogation : rien — elle n'ouvre que la grâce", () => {
    const input = inputAt(AFTER_GRACE, { id: "w_1" });
    expect(foreseenWaiver(input)).toBeNull();
    expect(() => ensureWithinOrderCutoff(input)).toThrow();
  });

  it("avant l'heure : aucune dérogation ne sert", () => {
    expect(foreseenWaiver(inputAt(BEFORE, { id: "w_1" }))).toBeNull();
  });
});

/**
 * **La concordance, minute par minute** (lot L4, plan
 * `le-prix-d-un-panier.md`, §2.4) : de 15:00Z à 18:00Z (avant l'heure,
 * la grâce, après), avec et sans dérogation, ce que le devis prévoit est ce
 * que la passation dépense — et là où la passation refuse, le devis ne
 * prévoit rien.
 */
describe("foreseenWaiver ≡ ensureWithinOrderCutoff — sur les trois heures qui bordent la limite", () => {
  const START_MS = new Date(BEFORE).getTime();
  const STEP_MS = 5 * 60_000;
  const STEPS = 36;
  const instants = Array.from({ length: STEPS + 1 }, (_, step) =>
    new Date(START_MS + step * STEP_MS).toISOString(),
  );

  it.each([{ id: "w_1" }, null])("dérogation %p : même décision à chaque instant", (waiver) => {
    for (const now of instants) {
      const input = inputAt(now, waiver);
      // Ce que la passation dépense ; `null` aussi quand elle refuse.
      let spent: string | null = null;
      try {
        spent = ensureWithinOrderCutoff(input);
      } catch {
        spent = null;
      }
      expect({ now, foreseen: foreseenWaiver(input) }).toEqual({
        now,
        foreseen: spent,
      });
    }
  });
});
