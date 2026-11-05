import { FixedClock } from "../../time/fixed-clock.js";
import {
  CACHE_OUTCOMES_CAPACITY,
  CACHE_OUTCOMES_WINDOW_MINUTES,
  InMemoryCacheOutcomes,
} from "../in-memory-cache-outcomes.js";

// L'instant n'est comparé qu'à l'horloge doublée : il ne juge rien du calendrier.
const START = new Date(1_755_600_000_000);
const MINUTE_MS = 60_000;

function outcomes(): { readonly store: InMemoryCacheOutcomes; readonly clock: FixedClock } {
  const clock = new FixedClock(START);
  return { store: new InMemoryCacheOutcomes(clock), clock };
}

describe("InMemoryCacheOutcomes — les issues de cache sur la fenêtre", () => {
  it("ne rend rien tant que rien n'a été compté", () => {
    expect(outcomes().store.read()).toEqual([]);
  });

  it("compte par cache, rend le total et la part de chaque issue, la plus fréquente d'abord", () => {
    const { store } = outcomes();
    store.record("principal", "memory");
    store.record("principal", "memory");
    store.record("principal", "memory");
    store.record("principal", "resolved-absent");
    store.record("shelf.read", "hit");

    expect(store.read()).toEqual([
      {
        cache: "principal",
        total: 4,
        outcomes: [
          { outcome: "memory", count: 3, share: 0.75 },
          { outcome: "resolved-absent", count: 1, share: 0.25 },
        ],
      },
      { cache: "shelf.read", total: 1, outcomes: [{ outcome: "hit", count: 1, share: 1 }] },
    ]);
  });

  it("oublie les minutes sorties de la fenêtre glissante", () => {
    const { store, clock } = outcomes();
    store.record("pricing", "miss");
    clock.advanceMs((CACHE_OUTCOMES_WINDOW_MINUTES - 1) * MINUTE_MS);
    store.record("pricing", "hit");
    expect(store.read()[0]?.total).toBe(2);

    clock.advanceMs(MINUTE_MS);
    expect(store.read()).toEqual([
      { cache: "pricing", total: 1, outcomes: [{ outcome: "hit", count: 1, share: 1 }] },
    ]);

    clock.advanceMs(CACHE_OUTCOMES_WINDOW_MINUTES * MINUTE_MS);
    expect(store.read()).toEqual([]);
  });

  it("🔴 reste bornée : un couple neuf au-delà de la capacité n'est pas compté, les connus si", () => {
    const { store } = outcomes();
    for (let index = 0; index < CACHE_OUTCOMES_CAPACITY; index += 1) {
      store.record("noisy", `outcome-${index}`);
    }
    store.record("late", "hit");
    store.record("noisy", "outcome-0");

    const read = store.read();
    expect(read.map((one) => one.cache)).toEqual(["noisy"]);
    expect(read[0]?.total).toBe(CACHE_OUTCOMES_CAPACITY + 1);
  });

  it("annonce sa fenêtre à qui la lit", () => {
    expect(outcomes().store.windowMinutes).toBe(CACHE_OUTCOMES_WINDOW_MINUTES);
  });
});
