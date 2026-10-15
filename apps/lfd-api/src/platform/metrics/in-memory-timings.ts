import { Injectable } from "@nestjs/common";

import { Clock } from "../time/clock.js";
import { TimingRecorder, type TimingLabels } from "./timing-recorder.js";
import { TimingWindowReader, type TimingSample } from "./timing-window.reader.js";

/** La fenêtre glissante — la même que celle des vitals : « en ce moment ». */
export const TIMINGS_WINDOW_MINUTES = 30;

const MS_PER_MINUTE = 60_000;

/**
 * Combien de mesures au plus par nom. Borné **par construction**, comme les
 * vitals : une file qui grandit sans fin dans un processus qui ne redémarre
 * pas est une fuite mémoire déguisée en outil de diagnostic. Deux mille
 * suffisent à un 95ᵉ centile et pèsent quelques dizaines de kilo-octets.
 */
export const TIMINGS_CAPACITY = 2_000;

interface Kept extends TimingSample {
  readonly at: number;
}

/**
 * Les mesures, **en mémoire et par instance** — sur le modèle de
 * `ops/vitals/vitals.store.ts`, et pour la même raison : une tendance, pas une
 * comptabilité. Avec plusieurs conteneurs, chacun voit sa part ; le jour où il
 * faut l'agrégat, la mesure part vers Analytics Engine comme le trafic.
 *
 * L'instant de rangement vient du `Clock` : il ne sert qu'à vieillir la
 * fenêtre, et une demi-seconde d'écart à l'ingress n'y change rien.
 */
@Injectable()
export class InMemoryTimings implements TimingRecorder, TimingWindowReader {
  readonly windowMinutes = TIMINGS_WINDOW_MINUTES;
  private readonly kept = new Map<string, Kept[]>();

  constructor(private readonly clock: Clock) {}

  record(name: string, labels: TimingLabels, ms: number, size: number): void {
    // Jetée, pas ramenée : une durée négative ou infinie n'a rien mesuré.
    if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(size) || size < 0) {
      return;
    }
    const at = this.clock.now().getTime();
    const next = [...(this.kept.get(name) ?? []), { at, labels, ms, size }];
    this.kept.set(name, next.slice(-TIMINGS_CAPACITY));
  }

  read(name: string): readonly TimingSample[] {
    const now = this.clock.now().getTime();
    const horizon = TIMINGS_WINDOW_MINUTES * MS_PER_MINUTE;
    return (this.kept.get(name) ?? [])
      .filter((one) => now - one.at <= horizon)
      .map(({ labels, ms, size }) => ({ labels, ms, size }));
  }
}
