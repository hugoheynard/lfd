import type { PlanVersion } from "../entities/plan-version.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Les versions du plan d'une journée** — port de LECTURE, distinct du
 * registre (ISP). L'écrivain d'une version lit la précédente sous le verrou :
 * c'est elle qui dit comment chaque envoi est entré au plan.
 */
export abstract class PlanVersionsReader {
  /** La version la plus récente de la journée, ou `null` : jamais versionnée. */
  abstract latestOf(day: ServiceDay): Promise<PlanVersion | null>;
}
