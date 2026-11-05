import { RecordingCacheOutcomes } from "../../../../platform/metrics/__tests__/metrics-doubles.js";
import type { ShelfCacheSignal } from "../../domain/ports/shelf-cache-signals.js";
import { CountingShelfCacheSignals, countedOutcomeOf } from "../counting-shelf-cache-signals.js";
import { LoggingShelfCacheSignals } from "../logging-shelf-cache-signals.js";

/** Le journal, doublé : retient les noms qu'on lui a confiés. */
class RecordingJournalSignals extends LoggingShelfCacheSignals {
  readonly emitted: string[] = [];

  override emit(signal: ShelfCacheSignal): void {
    this.emitted.push(signal.name);
  }
}

describe("CountingShelfCacheSignals — le rayon compté pour la carte de santé (C5)", () => {
  it("journalise TOUT signal, et ne compte que les issues", () => {
    const journal = new RecordingJournalSignals();
    const outcomes = new RecordingCacheOutcomes();
    const signals = new CountingShelfCacheSignals(journal, outcomes);

    signals.emit({ name: "hit" });
    signals.emit({ name: "miss" });
    signals.emit({ name: "stale_refused" });
    signals.emit({ name: "breaker_closed" });

    expect(journal.emitted).toEqual(["hit", "miss", "stale_refused", "breaker_closed"]);
    expect(outcomes.recorded).toEqual([
      "shelf.read:hit",
      "shelf.read:miss",
      "shelf.store:stale_refused",
    ]);
  });

  it.each<[ShelfCacheSignal, string | null]>([
    [{ name: "stored" }, "shelf.store:stored"],
    [{ name: "not_kept" }, "shelf.store:not_kept"],
    [{ name: "fallback", operation: "read", reason: "timeout" }, "shelf.read:fallback_timeout"],
    [{ name: "fallback", operation: "store", reason: "error" }, "shelf.store:fallback_error"],
    [{ name: "fallback", operation: "erase", reason: "error" }, null],
    [{ name: "public_cacheable" }, "shelf.public:cacheable"],
    [
      { name: "public_not_cacheable", reason: "version_moved" },
      "shelf.public:not_cacheable_version_moved",
    ],
    [{ name: "erased", scope: "all", companies: 0 }, null],
    [{ name: "switched", enabled: false, version: 2 }, null],
  ])("%j se compte comme %s", (signal, expected) => {
    const counted = countedOutcomeOf(signal);
    expect(counted === null ? null : `${counted.cache}:${counted.outcome}`).toBe(expected);
  });
});
