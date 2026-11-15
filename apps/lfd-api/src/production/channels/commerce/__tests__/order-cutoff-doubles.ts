import { OrderCutoffRulesReader } from "../order-cutoff-rules.reader.js";
import { ResupplyCutoffTimeReader } from "../resupply-cutoff-time.reader.js";
import type { OrderCutoffRule } from "../../../day/index.js";

/** Les heures limites du commerce, posées par le test. */
export class CutoffRules extends OrderCutoffRulesReader {
  constructor(public current: readonly OrderCutoffRule[] = []) {
    super();
  }

  rules(): Promise<readonly OrderCutoffRule[]> {
    return Promise.resolve(this.current);
  }
}

/**
 * L'heure du réassort, posée par le test (lot R3a). Par défaut minuit la
 * veille : la plus tôt possible, elle ne repousse aucun arrêt — les suites
 * d'avant le réassort gardent l'heure qu'elles éprouvent.
 */
export class ResupplyTime extends ResupplyCutoffTimeReader {
  constructor(public current = "00:00") {
    super();
  }

  eveTime(): Promise<string> {
    return Promise.resolve(this.current);
  }
}
