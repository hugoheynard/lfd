import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { InMemoryCacheOutcomes } from "../../../platform/metrics/in-memory-cache-outcomes.js";
import { cacheReports } from "../cache-readings.js";

// L'instant n'est comparé qu'à l'horloge doublée : il ne juge rien du calendrier.
const START = new Date(1_755_600_000_000);

describe("cacheReports — le relevé des caches sur la carte de santé (C5)", () => {
  it("rend par cache le total, la fenêtre et la part de chaque issue, arrondie au millième", () => {
    const counter = new InMemoryCacheOutcomes(new FixedClock(START));
    counter.record("principal", "memory");
    counter.record("principal", "memory");
    counter.record("principal", "resolved-stamp");
    counter.record("pricing.materials", "hit");

    expect(cacheReports(counter.read(), counter.windowMinutes)).toEqual([
      {
        cache: "pricing.materials",
        total: 1,
        windowMinutes: 30,
        outcomes: [{ outcome: "hit", count: 1, share: 1 }],
      },
      {
        cache: "principal",
        total: 3,
        windowMinutes: 30,
        outcomes: [
          { outcome: "memory", count: 2, share: 0.667 },
          { outcome: "resolved-stamp", count: 1, share: 0.333 },
        ],
      },
    ]);
  });

  it("ne rend aucune ligne quand rien n'a été compté", () => {
    expect(cacheReports([], 30)).toEqual([]);
  });

  it("écarte un cache sans question sur la fenêtre plutôt que d'afficher 0 %", () => {
    expect(cacheReports([{ cache: "principal", total: 0, outcomes: [] }], 30)).toEqual([]);
  });
});
