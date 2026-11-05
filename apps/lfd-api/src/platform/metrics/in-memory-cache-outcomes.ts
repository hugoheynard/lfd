import { Injectable } from "@nestjs/common";

import { Clock } from "../time/clock.js";
import {
  CacheOutcomeReader,
  type CacheOutcomeCount,
  type CacheOutcomeTally,
} from "./cache-outcome.reader.js";
import { CacheOutcomeRecorder } from "./cache-outcome-recorder.js";
import { TIMINGS_WINDOW_MINUTES } from "./in-memory-timings.js";

/** La même fenêtre que les durées : « en ce moment ». */
export const CACHE_OUTCOMES_WINDOW_MINUTES = TIMINGS_WINDOW_MINUTES;

/**
 * Combien de couples (cache, issue) au plus. Les étiquettes viennent de
 * l'appelant : une issue qui porterait par erreur une valeur libre ferait
 * grandir la carte sans fin. Au-delà, le couple neuf n'est pas compté — les
 * couples connus continuent de l'être.
 */
export const CACHE_OUTCOMES_CAPACITY = 200;

const MS_PER_MINUTE = 60_000;

/** Un couple (cache, issue) et ses comptes par minute — jamais un échantillon par appel. */
interface Counter {
  readonly cache: string;
  readonly outcome: string;
  readonly perMinute: Map<number, number>;
}

/**
 * Les issues de cache, **comptées par minute, en mémoire et par instance** —
 * sur le modèle d'`InMemoryTimings`, et pour la même raison : une tendance,
 * pas une comptabilité. Un compte par minute plutôt qu'une ligne par appel :
 * le principal compte UNE issue par requête, et deux mille échantillons n'y
 * couvriraient pas la fenêtre.
 *
 * La minute vient du `Clock` : elle ne sert qu'à vieillir la fenêtre.
 */
@Injectable()
export class InMemoryCacheOutcomes implements CacheOutcomeRecorder, CacheOutcomeReader {
  readonly windowMinutes = CACHE_OUTCOMES_WINDOW_MINUTES;
  private readonly counters = new Map<string, Counter>();

  constructor(private readonly clock: Clock) {}

  record(cache: string, outcome: string): void {
    const key = `${cache}\u0000${outcome}`;
    let counter = this.counters.get(key);
    if (counter === undefined) {
      if (this.counters.size >= CACHE_OUTCOMES_CAPACITY) {
        return;
      }
      counter = { cache, outcome, perMinute: new Map() };
      this.counters.set(key, counter);
    }
    const minute = this.currentMinute();
    counter.perMinute.set(minute, (counter.perMinute.get(minute) ?? 0) + 1);
    forgetBefore(counter, minute - CACHE_OUTCOMES_WINDOW_MINUTES);
  }

  read(): readonly CacheOutcomeTally[] {
    const oldest = this.currentMinute() - CACHE_OUTCOMES_WINDOW_MINUTES;
    const byCache = new Map<string, { outcome: string; count: number }[]>();
    for (const counter of this.counters.values()) {
      const count = countSince(counter, oldest);
      if (count > 0) {
        byCache.set(counter.cache, [
          ...(byCache.get(counter.cache) ?? []),
          { outcome: counter.outcome, count },
        ]);
      }
    }
    return [...byCache.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cache, outcomes]) => tally(cache, outcomes));
  }

  private currentMinute(): number {
    return Math.floor(this.clock.now().getTime() / MS_PER_MINUTE);
  }
}

/** La fenêtre couvre la minute en cours et les `WINDOW` précédentes. */
function countSince(counter: Counter, oldest: number): number {
  let count = 0;
  for (const [minute, value] of counter.perMinute) {
    if (minute > oldest) {
      count += value;
    }
  }
  return count;
}

function forgetBefore(counter: Counter, oldest: number): void {
  for (const minute of [...counter.perMinute.keys()]) {
    if (minute <= oldest) {
      counter.perMinute.delete(minute);
    }
  }
}

function tally(
  cache: string,
  counts: readonly { outcome: string; count: number }[],
): CacheOutcomeTally {
  const total = counts.reduce((sum, one) => sum + one.count, 0);
  const outcomes: CacheOutcomeCount[] = counts
    .map((one) => ({ ...one, share: one.count / total }))
    .sort((left, right) => right.count - left.count || left.outcome.localeCompare(right.outcome));
  return { cache, total, outcomes };
}
