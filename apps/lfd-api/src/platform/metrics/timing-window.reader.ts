import type { TimingLabels } from "./timing-recorder.js";

/** Une mesure retenue, telle que la fenêtre la rend. */
export interface TimingSample {
  readonly labels: TimingLabels;
  readonly ms: number;
  readonly size: number;
}

/**
 * Port de **lecture** des mesures : ce qui a été retenu sous un nom, sur la
 * fenêtre glissante. L'agrégat (centiles, moyennes) appartient au lecteur —
 * c'est lui qui sait ce que la mesure veut dire.
 */
export abstract class TimingWindowReader {
  /** La fenêtre glissante, en minutes — le lecteur l'annonce à l'écran. */
  abstract readonly windowMinutes: number;

  abstract read(name: string): readonly TimingSample[];
}
