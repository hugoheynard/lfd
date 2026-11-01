import { OSRM_WAKE_BUDGET_MS, type OsrmWakePacing } from "../osrm-fetch.js";

/**
 * Un rythme de réveil sans attente : chaque pause avance un temps écoulé
 * fictif, et se note. Le budget se règle par test.
 */
export class InstantPacing implements OsrmWakePacing {
  readonly pauses: number[] = [];
  private elapsed = 0;

  constructor(readonly budgetMs: number = OSRM_WAKE_BUDGET_MS) {}

  elapsedMs(): number {
    return this.elapsed;
  }

  pause(ms: number): Promise<void> {
    this.pauses.push(ms);
    this.elapsed += ms;
    return Promise.resolve();
  }
}
