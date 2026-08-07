import { runWithRequestContext } from "../../context/request-context.store.js";
import { SystemClock } from "../system-clock.js";

/**
 * L'adaptateur de production du `Clock` : dans une requête il rend l'instant
 * **gelé** à l'ingress (déterminisme, pas de dérive) ; hors requête il lit
 * l'heure système (cron, boot).
 */
describe("SystemClock", () => {
  const clock = new SystemClock();

  it("rend l'instant gelé du RequestContext dans une requête", () => {
    const now = new Date("2026-08-07T12:34:56.000Z");
    runWithRequestContext({ now, traceId: "t" }, () => {
      expect(clock.now()).toBe(now);
    });
  });

  it("rend le MÊME instant à deux lectures dans la même requête (pas de dérive)", () => {
    const now = new Date("2026-08-07T12:34:56.000Z");
    runWithRequestContext({ now, traceId: "t" }, () => {
      expect(clock.now().getTime()).toBe(clock.now().getTime());
    });
  });

  it("retombe sur l'heure système hors d'une requête", () => {
    const before = Date.now();
    const read = clock.now();
    const after = Date.now();
    expect(read).toBeInstanceOf(Date);
    expect(read.getTime()).toBeGreaterThanOrEqual(before);
    expect(read.getTime()).toBeLessThanOrEqual(after);
  });
});
