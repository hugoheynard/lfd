import type { ServiceDay } from "../../../day/index.js";
import type { DayTrackingLevels } from "../services/tracking-levels.js";

/** Port de **lecture** du niveau figé d'une journée. `null` : pas encore figé. */
export abstract class FrozenTrackingLevelsReader {
  abstract frozenOf(day: ServiceDay): Promise<DayTrackingLevels | null>;
}

/**
 * Port d'**écriture** du niveau figé d'une journée : une insertion qui ignore
 * le conflit sur la journée. Un second appel ne réécrit rien — le premier
 * niveau reste, même après une réouverture ou un retirage.
 */
export abstract class DayTrackingLevelsFreezer {
  abstract freeze(day: ServiceDay, levels: DayTrackingLevels, at: Date): Promise<void>;
}
