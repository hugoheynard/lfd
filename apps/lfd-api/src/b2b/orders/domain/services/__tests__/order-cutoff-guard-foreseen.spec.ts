import type { OrderCutoffView } from "@lfd/contracts";

import { ensureWithinOrderCutoff, foreseenWaiver } from "../order-cutoff-guard.js";

/**
 * **La dérogation prévue = la dérogation dépensée** (plan `plan-total-vu.md`,
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
