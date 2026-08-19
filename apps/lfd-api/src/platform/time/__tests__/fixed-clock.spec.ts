import { FixedClock } from "../fixed-clock.js";

/** Horloge déterministe pour les tests : figée, repositionnable, avançable. */
describe("FixedClock", () => {
  it("rend l'instant initial", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(new FixedClock(now).now()).toBe(now);
  });

  it("se repositionne avec set()", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const next = new Date("2026-02-01T00:00:00.000Z");
    clock.set(next);
    expect(clock.now()).toBe(next);
  });

  it("avance de N millisecondes avec advanceMs()", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    clock.advanceMs(60_000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });
});
