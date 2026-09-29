import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { busyStarts } from "../vehicle-availability.js";
import { lineCost } from "./line-cost.js";

const HOUR = 3600;
const MINUTE = 60;
const ctx = {
  depotId: "depot",
  cost: lineCost({ depot: 0, a: 10, b: 30 }),
  settings: RoutingSettings.define({ ...RoutingSettings.DEFAULTS, stopMinutes: 5 }),
};
const V1 = { id: "v1", name: "Camionnette 1" };
const V2 = { id: "v2", name: "Camionnette 2" };

/** Dépôt → a → dépôt : 10 + 5 + 10 minutes. Départ 6 h, retour 6 h 25. */
const ROUND_A = { roundId: "ra", vehicle: V1, passage: 1, stops: [{ id: "a", window: null }] };

describe("quand une camionnette occupée est libre (lot 7 ter, L7t-C2)", () => {
  it("au retour estimé de sa tournée gardée, et sa suivante est un 2ᵉ passage", () => {
    const starts = busyStarts(ctx, [{ ...ROUND_A, departedAt: null }]);

    expect(starts.get("v1")).toEqual({ availableFrom: 6 * HOUR + 25 * MINUTE, passagesBefore: 1 });
    expect(starts.has("v2")).toBe(false);
  });

  it("deux tournées gardées : libre au retour de la seconde, chronométrée après la première", () => {
    const starts = busyStarts(ctx, [
      {
        roundId: "rb",
        vehicle: V1,
        passage: 2,
        stops: [{ id: "b", window: null }],
        departedAt: null,
      },
      { ...ROUND_A, departedAt: null },
    ]);

    // 6 h 25 → b (30) + 5 + retour (30) = 7 h 30.
    expect(starts.get("v1")).toEqual({ availableFrom: 7 * HOUR + 30 * MINUTE, passagesBefore: 2 });
  });

  it("partie plus tard que l'heure chronométrée : son retour est repoussé d'autant", () => {
    const starts = busyStarts(ctx, [{ ...ROUND_A, departedAt: 7 * HOUR }]);

    expect(starts.get("v1")?.availableFrom).toBe(7 * HOUR + 25 * MINUTE);
  });

  it("partie plus tôt : le retour n'est jamais avancé", () => {
    const starts = busyStarts(ctx, [{ ...ROUND_A, departedAt: 5 * HOUR }]);

    expect(starts.get("v1")?.availableFrom).toBe(6 * HOUR + 25 * MINUTE);
  });

  it("chaque véhicule pour lui-même", () => {
    const starts = busyStarts(ctx, [
      { ...ROUND_A, departedAt: null },
      { ...ROUND_A, roundId: "r2", vehicle: V2, departedAt: null },
    ]);

    expect(starts.get("v2")).toEqual({ availableFrom: 6 * HOUR + 25 * MINUTE, passagesBefore: 1 });
  });
});
