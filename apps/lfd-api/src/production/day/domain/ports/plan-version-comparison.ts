import type { PlanVersionDiff } from "../services/plan-version-diff/plan-version-diff.types.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Ce que la journée sait répondre : ce qui a changé de la version `from`
 * à la version `to`** (`documentation/fournil/les-versions-du-plan.md`) — le diff du noyau, calculé sur ses versions. Un
 * port à part de la liste (ISP) : l'écran et, demain, le réenvoi ne lisent
 * que l'un ou l'autre.
 */
export abstract class PlanVersionComparison {
  /**
   * @throws {PlanVersionRangeInvertedError} `from` est après `to` (400).
   * @throws {PlanVersionNotFoundError} une version de `from` à `to` manque (404).
   */
  abstract compare(day: ServiceDay, from: number, to: number): Promise<PlanVersionDiff>;
}
