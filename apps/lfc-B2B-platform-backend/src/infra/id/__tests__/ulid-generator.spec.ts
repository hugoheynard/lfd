import { decodeTime } from "ulid";

import { FixedClock } from "../../time/fixed-clock.js";
import { UlidGenerator } from "../ulid-generator.js";

/**
 * L'adaptateur ULID : identifiants horodatés par le `Clock` (triables par le
 * temps, déterministes en test) et strictement croissants même dans la même
 * milliseconde (monotonie → pas de collision).
 */
describe("UlidGenerator", () => {
  const NOW = new Date("2026-08-07T10:00:00.000Z");

  it("rend un ULID de 26 caractères", () => {
    const gen = new UlidGenerator(new FixedClock(NOW));
    expect(gen.next()).toHaveLength(26);
  });

  it("horodate le ULID avec le temps du Clock (pas l'heure murale)", () => {
    const gen = new UlidGenerator(new FixedClock(NOW));
    expect(decodeTime(gen.next())).toBe(NOW.getTime());
  });

  it("est strictement croissant dans une même milliseconde (monotonie)", () => {
    const gen = new UlidGenerator(new FixedClock(NOW));
    const ids = Array.from({ length: 100 }, () => gen.next());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reste ordonné quand le temps avance", () => {
    const clock = new FixedClock(NOW);
    const gen = new UlidGenerator(clock);
    const early = gen.next();
    clock.advanceMs(1000);
    const late = gen.next();
    expect(early < late).toBe(true);
    expect(decodeTime(late)).toBe(NOW.getTime() + 1000);
  });
});
