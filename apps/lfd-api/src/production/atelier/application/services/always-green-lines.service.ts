import { Injectable } from "@nestjs/common";

import type { ProductionDay, ServiceDay } from "../../../day/index.js";
import type { DayTrackingLevels } from "../../domain/services/tracking-levels.js";
import { WorksheetTrackingLevelsReading } from "./worksheet-tracking-levels.js";

/** Aucun rangement lu : le poste des articles est relu s'il le faut. */
const NO_GROUPING_READ = { mode: "shelf", shelves: null } as const;

/**
 * **Les lignes d'une journée en toujours vert** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : les SKU
 * au compte dont la ligne suit le niveau `always_green`, d'après les niveaux
 * que l'appelant a lus (figés pour le cron, servis pour la Supervision).
 *
 * La règle du niveau d'une ligne est celle de la fiche
 * (`WorksheetTrackingLevelsReading`) : des postes illisibles servent les
 * lignes en détaillé, donc aucune n'est complétée d'office.
 */
@Injectable()
export class AlwaysGreenLines {
  constructor(private readonly lineLevels: WorksheetTrackingLevelsReading) {}

  async skusOf(
    day: ServiceDay,
    current: ProductionDay,
    levels: DayTrackingLevels,
  ): Promise<readonly string[]> {
    const skus = current.counts.map((item) => item.sku);
    if (skus.length === 0) {
      return [];
    }
    const tracked = await this.lineLevels.read(day, levels, skus, NO_GROUPING_READ);
    return skus.filter((sku) => tracked.outputLevelOf(sku) === "always_green");
  }
}
