import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedCommissioning, InMemoryTrackingSettings } from "../../__tests__/tracking-doubles.js";
import { GetProductionTrackingHandler } from "../get-production-tracking.handler.js";

/**
 * Ce que la page « Niveau de suivi » lit : le réglage, et si la mise en
 * service est passée (plan `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.1).
 * Les instants sont relatifs à l'horloge du test.
 */
const NOW = new Date();
const HOUR_MS = 60 * 60 * 1000;

function handlerAt(since: Date): GetProductionTrackingHandler {
  return new GetProductionTrackingHandler(
    new InMemoryTrackingSettings().reader(),
    new FixedCommissioning(since),
    new FixedClock(NOW),
  );
}

describe("GetProductionTrackingHandler", () => {
  it("sert le défaut et une mise en service passée", async () => {
    const since = new Date(NOW.getTime() - HOUR_MS);

    expect(await handlerAt(since).execute()).toEqual({
      level: "always_green",
      marginMinutes: 15,
      inServiceSince: since.toISOString(),
      inService: true,
    });
  });

  it("dit une mise en service encore à venir", async () => {
    const since = new Date(NOW.getTime() + HOUR_MS);

    expect(await handlerAt(since).execute()).toMatchObject({
      inServiceSince: since.toISOString(),
      inService: false,
    });
  });
});
