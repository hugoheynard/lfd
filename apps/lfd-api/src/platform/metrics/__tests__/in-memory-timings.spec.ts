import { FixedClock } from "../../time/fixed-clock.js";
import { InMemoryTimings, TIMINGS_CAPACITY, TIMINGS_WINDOW_MINUTES } from "../in-memory-timings.js";

// L'instant n'est comparé qu'à l'horloge doublée : il ne juge rien du calendrier.
const START = new Date(1_755_600_000_000);
const MINUTE_MS = 60_000;
const LABELS = { caller: "cart", audience: "pro" };

function timings(): { readonly store: InMemoryTimings; readonly clock: FixedClock } {
  const clock = new FixedClock(START);
  return { store: new InMemoryTimings(clock), clock };
}

describe("InMemoryTimings — la fenêtre des durées", () => {
  it("ne rend rien sous un nom jamais mesuré", () => {
    expect(timings().store.read("pricing.resolve")).toEqual([]);
  });

  it("rend ce qui a été retenu sous CE nom, et pas sous un autre", () => {
    const { store } = timings();
    store.record("pricing.resolve", LABELS, 12, 3);
    store.record("other", LABELS, 99, 1);

    expect(store.read("pricing.resolve")).toEqual([{ labels: LABELS, ms: 12, size: 3 }]);
  });

  it("oublie ce qui est sorti de la fenêtre glissante", () => {
    const { store, clock } = timings();
    store.record("pricing.resolve", LABELS, 12, 1);
    clock.advanceMs(TIMINGS_WINDOW_MINUTES * MINUTE_MS);
    store.record("pricing.resolve", LABELS, 20, 1);

    expect(store.read("pricing.resolve")).toHaveLength(2);

    clock.advanceMs(1);
    expect(store.read("pricing.resolve").map((one) => one.ms)).toEqual([20]);
  });

  it("jette une durée négative ou infinie plutôt que de la ramener", () => {
    const { store } = timings();
    store.record("pricing.resolve", LABELS, -1, 1);
    store.record("pricing.resolve", LABELS, Number.POSITIVE_INFINITY, 1);
    store.record("pricing.resolve", LABELS, 5, -2);

    expect(store.read("pricing.resolve")).toEqual([]);
  });

  it("🔴 reste bornée : une file sans fin serait une fuite mémoire", () => {
    const { store } = timings();
    for (let index = 0; index < TIMINGS_CAPACITY + 5; index += 1) {
      store.record("pricing.resolve", LABELS, index, 1);
    }

    const kept = store.read("pricing.resolve");
    expect(kept).toHaveLength(TIMINGS_CAPACITY);
    expect(kept[0]?.ms).toBe(5);
  });

  it("annonce sa fenêtre à qui la lit", () => {
    expect(timings().store.windowMinutes).toBe(TIMINGS_WINDOW_MINUTES);
  });
});
