import type { AttemptTrace } from "../services/auto-close-round.js";
import type { ServiceRange } from "../value-objects/service-range.value-object.js";

/** Une tentative, avec la journée qu'elle visait. */
export interface DatedAttemptTrace extends AttemptTrace {
  /** `AAAA-MM-JJ`. */
  readonly day: string;
}

/**
 * **Les tentatives d'arrêt automatique d'une plage**, pour l'état des
 * journées du prévisionnel (plan `arret-du-plan.md`, §5, lot A3).
 *
 * Un port à part de `AutoCloseRoundReader` (ISP) : le tour pose deux questions
 * sur UNE journée, le prévisionnel en lit une plage. Une journée absente du
 * résultat n'a pas été tentée.
 */
export abstract class AutoCloseAttemptLog {
  abstract between(range: ServiceRange): Promise<readonly DatedAttemptTrace[]>;
}
