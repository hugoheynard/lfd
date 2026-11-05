import { Global, Module } from "@nestjs/common";

import { CacheOutcomeReader } from "./cache-outcome.reader.js";
import { CacheOutcomeRecorder } from "./cache-outcome-recorder.js";
import { InMemoryCacheOutcomes } from "./in-memory-cache-outcomes.js";
import { InMemoryTimings } from "./in-memory-timings.js";
import { MonotonicStopwatch } from "./monotonic-stopwatch.js";
import { Stopwatch } from "./stopwatch.js";
import { TimingRecorder } from "./timing-recorder.js";
import { TimingWindowReader } from "./timing-window.reader.js";

/**
 * Les **mesures de durée**, technique pure. `@Global` comme le contexte : le
 * commerce écrit, `ops` lit, et aucun des deux ne peut importer l'autre.
 *
 * Les issues de cache (C5) suivent la même forme.
 *
 * 🔴 Les deux ports pointent la MÊME instance (`useExisting`) : deux
 * `useClass` feraient deux mémoires, et la carte lirait une fenêtre où
 * personne n'écrit.
 */
@Global()
@Module({
  providers: [
    InMemoryTimings,
    { provide: TimingRecorder, useExisting: InMemoryTimings },
    { provide: TimingWindowReader, useExisting: InMemoryTimings },
    InMemoryCacheOutcomes,
    { provide: CacheOutcomeRecorder, useExisting: InMemoryCacheOutcomes },
    { provide: CacheOutcomeReader, useExisting: InMemoryCacheOutcomes },
    { provide: Stopwatch, useClass: MonotonicStopwatch },
  ],
  exports: [
    TimingRecorder,
    TimingWindowReader,
    CacheOutcomeRecorder,
    CacheOutcomeReader,
    Stopwatch,
  ],
})
export class MetricsModule {}
