import type { ProductionTrackingLevel } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { ServiceDay } from "../../../day/index.js";
import type { GroupingSource } from "../../../shared/print/index.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import {
  type DayTrackingLevels,
  isUniform,
  lineLevelOf,
} from "../../domain/services/tracking-levels.js";

/** Le niveau de chaque ligne, et s'il a pu être lu en entier. */
export interface WorksheetTrackingLevels {
  readonly levelOf: (sku: string) => ProductionTrackingLevel;
  /** `false` : les postes n'ont pas pu être lus — les lignes sont servies en détaillé. */
  readonly known: boolean;
}

/**
 * **Le niveau de suivi de chaque ligne de la fiche** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.1) : celui du poste
 * de son produit dans la journée, sinon celui du fournil. Servi par ligne,
 * il vaut quel que soit le groupe où la ligne est rangée.
 *
 * Il ne lit le poste des articles que s'il le faut : tous les postes au
 * niveau du fournil, chaque ligne l'est ; en mode prod, le rangement les a
 * déjà lus. Des postes illisibles servent les lignes en **détaillé** — le
 * niveau où rien n'est automatique et où tout geste reste possible — et la
 * fiche n'est pas gardée.
 */
@Injectable()
export class WorksheetTrackingLevelsReading {
  constructor(private readonly grouping: GroupingSourceReading) {}

  async read(
    day: ServiceDay,
    levels: DayTrackingLevels,
    skus: readonly string[],
    source: GroupingSource,
  ): Promise<WorksheetTrackingLevels> {
    if (isUniform(levels)) {
      return { levelOf: () => levels.house, known: true };
    }
    const bySku = await this.grouping.workstationOfSkus(
      skus,
      `Fiche d'atelier du ${day.value}`,
      source,
    );
    if (bySku === null) {
      return { levelOf: () => "detailed", known: false };
    }
    return { levelOf: (sku) => lineLevelOf(levels, bySku.get(sku)), known: true };
  }
}
