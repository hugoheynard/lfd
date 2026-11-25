import { Injectable } from "@nestjs/common";

import type { ProductionDay, ServiceDay } from "../../../day/index.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import type { LineStepKey } from "../../domain/entities/line-step.js";
import { type DayTrackingLevels, lineLevelOf } from "../../domain/services/tracking-levels.js";
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
  constructor(
    private readonly lineLevels: WorksheetTrackingLevelsReading,
    private readonly grouping: GroupingSourceReading,
  ) {}

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

  /**
   * **Les étapes en toujours vert** (
   * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.4) :
   * chaque poste d'une ligne au compte qui ne la finit pas, sur la carte
   * courante, dont le niveau figé du jour est `always_green`. Les postes sont
   * relus : une étape existe quel que soit le niveau du fournil. Illisibles,
   * aucune étape n'est cochée d'office — la panne est journalisée par la
   * lecture.
   */
  async stepsOf(
    day: ServiceDay,
    current: ProductionDay,
    levels: DayTrackingLevels,
  ): Promise<readonly LineStepKey[]> {
    const skus = current.counts.map((item) => item.sku);
    if (skus.length === 0) {
      return [];
    }
    const bySku = await this.grouping.workstationOfSkus(
      skus,
      `Étapes toujours vert du ${day.value}`,
      NO_GROUPING_READ,
    );
    if (bySku === null) {
      return [];
    }
    return skus.flatMap((sku) =>
      (bySku.get(sku) ?? [])
        .filter(
          (station) =>
            !station.finishes && lineLevelOf(levels, station.workstationId) === "always_green",
        )
        .map((station) => ({ serviceDay: day.value, sku, workstationId: station.workstationId })),
    );
  }
}
