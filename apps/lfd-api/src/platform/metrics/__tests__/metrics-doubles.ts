import { Stopwatch } from "../stopwatch.js";
import { TimingRecorder, type TimingLabels } from "../timing-recorder.js";

/** Une mesure retenue par {@link RecordingTimings}. */
export interface RecordedTiming {
  readonly name: string;
  readonly labels: TimingLabels;
  readonly ms: number;
  readonly size: number;
}

/** `TimingRecorder` qui retient ce qu'on lui confie, pour l'assertion. */
export class RecordingTimings extends TimingRecorder {
  readonly recorded: RecordedTiming[] = [];

  record(name: string, labels: TimingLabels, ms: number, size: number): void {
    this.recorded.push({ name, labels, ms, size });
  }
}

/** `Stopwatch` déterministe : toute mesure dure `elapsedMs`. */
export class FixedStopwatch extends Stopwatch {
  constructor(private readonly elapsedMs = 0) {
    super();
  }

  start(): () => number {
    return () => this.elapsedMs;
  }
}
