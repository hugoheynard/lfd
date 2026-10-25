import { localToInstant } from "@lfd/contracts";

import { passedLimit } from "../order-cutoff-scene.js";

const MINUTE_MS = 60_000;

/** La fin du rattrapage telle que la résolution la relira. */
function graceEnd(limit: ReturnType<typeof passedLimit>): number {
  const at = localToInstant(limit.day, limit.time);
  if (at === null) {
    throw new Error(`heure inexistante : ${limit.day} ${limit.time}`);
  }
  return at.getTime() + limit.graceMinutes * MINUTE_MS;
}

/**
 * Régression : la nuit du passage à l'heure d'hiver, une limite posée « il y a
 * dix minutes » à 02:30 (heure d'hiver) se relisait à la première occurrence,
 * une heure plus tôt, et `orders.cutoff.grace` devenait `past` (2026-10-25).
 */
describe("passedLimit", () => {
  // Bascule du 2026-10-25 : 01:00Z = 03:00 d'été devient 02:00 d'hiver.
  const TRANSITION = Date.UTC(2026, 9, 25, 1, 0);
  const instants = Array.from(
    { length: 200 },
    (_, i) => new Date(TRANSITION - 90 * MINUTE_MS + i * MINUTE_MS),
  );

  it.each([
    [10, 45],
    [10, 5],
  ])(
    "garde la fin du rattrapage et une limite passée autour de la bascule (%i min, grâce %i)",
    (ago, grace) => {
      for (const now of instants) {
        const limit = passedLimit(now, ago, grace);
        const expectedEnd =
          Math.floor((now.getTime() - ago * MINUTE_MS) / MINUTE_MS) * MINUTE_MS + grace * MINUTE_MS;
        expect(graceEnd(limit)).toBe(expectedEnd);
        expect(graceEnd(limit) - limit.graceMinutes * MINUTE_MS).toBeLessThan(now.getTime());
      }
    },
  );

  it("recule une limite tombée dans l'heure répétée, et allonge la grâce d'autant", () => {
    // 01:20Z = 02:20 d'hiver ; dix minutes plus tôt, 02:10 d'hiver, se relirait
    // une heure plus tôt. 02:59 d'été (00:59Z) est la première occurrence : elle tient.
    const limit = passedLimit(new Date(TRANSITION + 20 * MINUTE_MS), 10, 45);
    expect(limit).toEqual({ day: "2026-10-25", time: "02:59", graceMinutes: 45 + 11 });
  });

  it("ne touche rien hors de la bascule", () => {
    expect(passedLimit(new Date(Date.UTC(2026, 9, 20, 10, 0)), 10, 45)).toEqual({
      day: "2026-10-20",
      time: "11:50",
      graceMinutes: 45,
    });
  });
});
